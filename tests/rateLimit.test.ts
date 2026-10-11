import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter, createSharedRateLimiter } from "@/app/lib/rateLimit";

describe("createSharedRateLimiter", () => {
  it("falls back to the in-memory limiter when Upstash is not configured", async () => {
    // The test env sets no UPSTASH_/KV_ vars, like local dev.
    const check = createSharedRateLimiter("test", 2, 60_000);
    expect(await check("a")).toMatchObject({ allowed: true, remaining: 1 });
    expect(await check("a")).toMatchObject({ allowed: true, remaining: 0 });
    expect(await check("a")).toMatchObject({ allowed: false, remaining: 0 });
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit, then blocks", () => {
    const check = createRateLimiter(3, 1000);
    expect(check("a", 0)).toMatchObject({ allowed: true, remaining: 2 });
    expect(check("a", 1)).toMatchObject({ allowed: true, remaining: 1 });
    expect(check("a", 2)).toMatchObject({ allowed: true, remaining: 0 });
    expect(check("a", 3)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("keys buckets separately", () => {
    const check = createRateLimiter(1, 1000);
    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 0).allowed).toBe(false);
    expect(check("b", 0).allowed).toBe(true);
  });

  it("resets once the window elapses", () => {
    const check = createRateLimiter(1, 1000);
    expect(check("a", 0).allowed).toBe(true);
    expect(check("a", 999).allowed).toBe(false);
    expect(check("a", 1000).allowed).toBe(true);
  });

  it("reports a positive retry-after while blocked", () => {
    const check = createRateLimiter(1, 60_000);
    check("a", 0);
    expect(check("a", 10_000).retryAfterSeconds).toBe(50);
  });

  it("stays blocked for the rest of the window rather than sliding", () => {
    const check = createRateLimiter(2, 1000);
    check("a", 0);
    check("a", 0);
    expect(check("a", 500).allowed).toBe(false);
    expect(check("a", 900).allowed).toBe(false);
    expect(check("a", 1000).allowed).toBe(true);
  });
});

describe("clientKey", () => {
  function req(headers: Record<string, string>): Request {
    return new Request("https://example.test/api/generate", { method: "POST", headers });
  }

  it("takes the first x-forwarded-for hop", () => {
    expect(clientKey(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(req({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  });

  it("buckets unidentifiable callers together rather than exempting them", () => {
    expect(clientKey(req({}))).toBe("unknown");
    expect(clientKey(req({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});
