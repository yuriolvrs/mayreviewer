// Cloudflare Turnstile bot check for the AI routes. The browser sends a
// one-time token in a header; the server confirms it with Cloudflare before
// it spends any model quota. A passed check is remembered in a signed cookie
// (the "pass") for 45 minutes, so the next requests need no new token. The
// pass has a cap of uses. With no TURNSTILE_SECRET_KEY (local dev, tests) the
// check is skipped.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createSharedRateLimiter } from "./rateLimit";
import { PASS_EXP_COOKIE, TURNSTILE_HEADER, TURNSTILE_REQUIRED_CODE } from "./turnstileShared";

export { TURNSTILE_HEADER };

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// Real tokens are well under this; anything longer is not worth sending on.
const MAX_TOKEN_CHARS = 2048;

const PASS_COOKIE = "mr_pass";
const PASS_TTL_MS = 45 * 60_000;
const PASS_MAX_USES = 30;
// Counts uses per pass id. A copied cookie shares the count with the original.
const checkPassUses = createSharedRateLimiter("turnstile-pass", PASS_MAX_USES, PASS_TTL_MS);

function sign(secret: string, payload: string): string {
  const key = createHmac("sha256", secret).update("mr_pass v1").digest();
  return createHmac("sha256", key).update(payload).digest("base64url");
}

// Exported for tests.
export function createPassValue(secret: string, passId: string, expMs: number): string {
  const payload = `${passId}.${expMs}`;
  return `${payload}.${sign(secret, payload)}`;
}

// Returns the pass id when the cookie value is signed by us and not expired.
function readPass(secret: string, value: string | undefined, now: number): string | null {
  const parts = value?.split(".");
  if (!parts || parts.length !== 3) return null;
  const [passId, exp, sig] = parts;
  const expMs = Number(exp);
  if (!passId || !Number.isFinite(expMs) || expMs <= now) return null;
  const expected = Buffer.from(sign(secret, `${passId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return passId;
}

function cookieFromHeader(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

// Cookies set through cookies() are merged into the response by Next.js, also
// for a streamed body. Outside a request (some tests) cookies() throws; the
// pass is only a convenience, so that is ignored.
async function setCookies(set: (store: Awaited<ReturnType<typeof cookies>>) => void) {
  try {
    set(await cookies());
  } catch {
    // No request scope.
  }
}

const COOKIE_BASE = { secure: true, sameSite: "strict" as const };

async function issuePass(secret: string, now: number) {
  const passId = randomUUID();
  const expMs = now + PASS_TTL_MS;
  await checkPassUses(passId); // This request is use #1.
  const maxAge = PASS_TTL_MS / 1000;
  await setCookies((store) => {
    store.set(PASS_COOKIE, createPassValue(secret, passId, expMs), {
      ...COOKIE_BASE,
      httpOnly: true,
      path: "/api",
      maxAge,
    });
    store.set(PASS_EXP_COOKIE, String(expMs), { ...COOKIE_BASE, httpOnly: false, path: "/", maxAge });
  });
}

export async function verifyTurnstile(request: Request, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;

  const now = Date.now();
  const passCookie = cookieFromHeader(request, PASS_COOKIE);
  const passId = readPass(secret, passCookie, now);
  if (passId && (await checkPassUses(passId)).allowed) return true;

  if (await confirmToken(request, secret, fetchImpl)) {
    await issuePass(secret, now);
    return true;
  }

  // Tell the page its hint is stale, so it asks for a token up front next time.
  if (passCookie || cookieFromHeader(request, PASS_EXP_COOKIE)) {
    await setCookies((store) => {
      store.set(PASS_EXP_COOKIE, "", { ...COOKIE_BASE, path: "/", maxAge: 0 });
    });
  }
  return false;
}

async function confirmToken(request: Request, secret: string, fetchImpl: typeof fetch): Promise<boolean> {
  const token = request.headers.get(TURNSTILE_HEADER);
  if (!token || token.length > MAX_TOKEN_CHARS) return false;

  const form = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) form.set("remoteip", ip);

  // Fails closed: if Cloudflare cannot answer, the request is refused rather
  // than let through unchecked.
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export function turnstileRejection(): Response {
  return Response.json(
    {
      error: "Couldn't confirm you're not a bot. Reload the page and try again.",
      code: TURNSTILE_REQUIRED_CODE,
    },
    { status: 403 },
  );
}
