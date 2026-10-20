import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setCalls: { name: string; value: string; options: Record<string, unknown> }[] = [];
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, value: string, options: Record<string, unknown>) => {
      setCalls.push({ name, value, options });
    },
  }),
}));

import { TURNSTILE_HEADER, createPassValue, turnstileRejection, verifyTurnstile } from "@/app/lib/turnstile";

function request(token?: string, pass?: string): Request {
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
  if (token) headers[TURNSTILE_HEADER] = token;
  if (pass) headers.cookie = `mr_pass=${pass}`;
  return new Request("http://localhost/api/generate", { method: "POST", headers });
}

function reply(body: unknown) {
  return vi.fn(async () => Response.json(body)) as unknown as typeof fetch;
}

beforeEach(() => {
  setCalls.length = 0;
});
afterEach(() => vi.unstubAllEnvs());

describe("verifyTurnstile", () => {
  it("skips the check when no secret is configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const fetchImpl = reply({ success: false });
    expect(await verifyTurnstile(request(), fetchImpl)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a missing token without calling Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile(request(), fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the secret, token, and first client IP, and trusts Cloudflare's answer", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile(request("tok"), fetchImpl)).toBe(true);
    const body = (vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ secret: "secret", response: "tok", remoteip: "203.0.113.7" });

    expect(await verifyTurnstile(request("tok"), reply({ success: false }))).toBe(false);
  });

  it("fails closed when Cloudflare can't be reached", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile(request("tok"), fetchImpl)).toBe(false);
  });

  describe("pass cookie", () => {
    const future = () => Date.now() + 10 * 60_000;

    it("accepts a valid pass without a token or a Cloudflare call", async () => {
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
      const fetchImpl = reply({ success: false });
      const pass = createPassValue("secret", "pass-valid", future());
      expect(await verifyTurnstile(request(undefined, pass), fetchImpl)).toBe(true);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects a tampered signature, a changed expiry, and another secret", async () => {
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
      const exp = future();
      const pass = createPassValue("secret", "pass-tamper", exp);
      const badSig = pass.slice(0, -2) + (pass.endsWith("AA") ? "BB" : "AA");
      const longer = pass.replace(`.${exp}.`, `.${exp + 3_600_000}.`);
      const foreign = createPassValue("other", "pass-tamper", exp);
      for (const value of [badSig, longer, foreign, "garbage"]) {
        expect(await verifyTurnstile(request(undefined, value), reply({ success: false }))).toBe(false);
      }
    });

    it("rejects an expired pass", async () => {
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
      const pass = createPassValue("secret", "pass-old", Date.now() - 1000);
      expect(await verifyTurnstile(request(undefined, pass), reply({ success: false }))).toBe(false);
    });

    it("asks for a token once a pass has used its 30 requests", async () => {
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
      const pass = createPassValue("secret", "pass-cap", future());
      for (let i = 0; i < 30; i++) {
        expect(await verifyTurnstile(request(undefined, pass), reply({ success: false }))).toBe(true);
      }
      expect(await verifyTurnstile(request(undefined, pass), reply({ success: false }))).toBe(false);
      // A fresh token still works, and issues a new pass.
      expect(await verifyTurnstile(request("tok", pass), reply({ success: true }))).toBe(true);
      expect(setCalls.map((c) => c.name)).toContain("mr_pass");
    });

    it("issues the pass and the readable hint after a good token", async () => {
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
      const before = Date.now();
      expect(await verifyTurnstile(request("tok"), reply({ success: true }))).toBe(true);
      const pass = setCalls.find((c) => c.name === "mr_pass")!;
      const hint = setCalls.find((c) => c.name === "mr_pass_exp")!;
      expect(pass.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/api", maxAge: 2700 });
      expect(hint.options).toMatchObject({ httpOnly: false, secure: true, sameSite: "strict", path: "/", maxAge: 2700 });
      expect(Number(hint.value)).toBeGreaterThanOrEqual(before + 2700_000);
      // The issued pass is accepted on the next request.
      expect(await verifyTurnstile(request(undefined, pass.value), reply({ success: false }))).toBe(true);
    });

    it("clears the hint when a stale pass is rejected", async () => {
      vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
      const pass = createPassValue("secret", "pass-stale", Date.now() - 1000);
      await verifyTurnstile(request(undefined, pass), reply({ success: false }));
      expect(setCalls).toEqual([
        expect.objectContaining({ name: "mr_pass_exp", value: "", options: expect.objectContaining({ maxAge: 0 }) }),
      ]);
    });
  });
});

describe("turnstileRejection", () => {
  it("is a 403 with the turnstile_required code", async () => {
    const res = turnstileRejection();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "turnstile_required" });
  });
});
