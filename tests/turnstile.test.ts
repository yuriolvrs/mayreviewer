import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_HEADER, verifyTurnstile } from "@/app/lib/turnstile";

function request(token?: string): Request {
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
  if (token) headers[TURNSTILE_HEADER] = token;
  return new Request("http://localhost/api/generate", { method: "POST", headers });
}

function reply(body: unknown) {
  return vi.fn(async () => Response.json(body)) as unknown as typeof fetch;
}

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
});
