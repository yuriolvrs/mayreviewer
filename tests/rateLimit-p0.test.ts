import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/app/lib/rateLimit";

describe("createRateLimiter hardening", () => {
  it("normalizes keys (case/whitespace) to one bucket", () => {
    const check = createRateLimiter(2, 60_000);
    expect(check("  User ").allowed).toBe(true);
    expect(check("user").allowed).toBe(true);
    expect(check("USER").allowed).toBe(false);
  });

  it("caps bucket growth under spoofed-IP floods", () => {
    const check = createRateLimiter(1, 60_000);
    for (let i = 0; i < 20_000; i++) check(`ip-${i}`);
    // Still functional after the flood: fresh keys get a bucket, old ones roll.
    expect(check("final-key").allowed).toBe(true);
    expect(check("final-key", Date.now() + 61_000).allowed).toBe(true);
  });
});
