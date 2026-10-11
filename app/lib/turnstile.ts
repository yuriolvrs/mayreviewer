// Cloudflare Turnstile bot check for the AI routes. The browser sends a
// one-time token in a header; the server confirms it with Cloudflare before
// it spends any model quota. With no TURNSTILE_SECRET_KEY (local dev, tests)
// the check is skipped.

export const TURNSTILE_HEADER = "x-turnstile-token";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
// Real tokens are well under this; anything longer is not worth sending on.
const MAX_TOKEN_CHARS = 2048;

export async function verifyTurnstile(request: Request, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;

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
    { error: "Couldn't confirm you're not a bot. Reload the page and try again." },
    { status: 403 },
  );
}
