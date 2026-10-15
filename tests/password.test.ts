import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  hasPassword,
  hasProvider,
  parseSupabaseWait,
  resetCapReached,
  resetLinkWait,
  validateNewPassword,
} from "@/app/lib/password";

function makeUser(partial: Partial<User>): User {
  return { app_metadata: {}, user_metadata: {}, identities: [], ...partial } as unknown as User;
}

const googleOnly = makeUser({
  app_metadata: { providers: ["google"] },
  identities: [{ provider: "google" }] as User["identities"],
});
const emailUser = makeUser({
  app_metadata: { providers: ["email"] },
  identities: [{ provider: "email" }] as User["identities"],
});
const googleWithPassword = makeUser({
  app_metadata: { providers: ["google"] },
  user_metadata: { password_set: true },
});

describe("hasPassword", () => {
  it("is false for a Google-only user", () => {
    expect(hasPassword(googleOnly)).toBe(false);
  });
  it("is true for an email user", () => {
    expect(hasPassword(emailUser)).toBe(true);
  });
  it("is true for an email identity without provider metadata", () => {
    expect(hasPassword(makeUser({ identities: [{ provider: "email" }] as User["identities"] }))).toBe(true);
  });
  it("is true for a Google user with password_set", () => {
    expect(hasPassword(googleWithPassword)).toBe(true);
  });
});

describe("validateNewPassword", () => {
  it("rejects short passwords", () => {
    expect(validateNewPassword("12345", "12345")).toBe("Use at least 6 characters.");
  });
  it("rejects mismatches", () => {
    expect(validateNewPassword("123456", "654321")).toBe("Passwords don't match.");
  });
  it("accepts a valid pair", () => {
    expect(validateNewPassword("123456", "123456")).toBeNull();
  });
});

describe("hasProvider", () => {
  it("detects providers", () => {
    expect(hasProvider(googleOnly, "google")).toBe(true);
    expect(hasProvider(emailUser, "google")).toBe(false);
  });
});

describe("resetLinkWait", () => {
  const now = 10_000_000_000;
  const min = 60_000;
  it("allows a fresh start", () => {
    expect(resetLinkWait([], now)).toBe(0);
  });
  it("waits out the 60s cooldown", () => {
    expect(resetLinkWait([now - 18_000], now)).toBe(42);
    expect(resetLinkWait([now - 61_000], now)).toBe(0);
  });
  it("blocks at 3 sends in an hour until the oldest ages out", () => {
    const sends = [now - 50 * min, now - 20 * min, now - 5 * min];
    expect(resetLinkWait(sends, now)).toBe(10 * 60);
    expect(resetCapReached(sends, now)).toBe(true);
  });
  it("allows again after the hour", () => {
    const sends = [now - 61 * min, now - 20 * min, now - 5 * min];
    expect(resetLinkWait(sends, now)).toBe(0);
    expect(resetCapReached(sends, now)).toBe(false);
  });
});

describe("parseSupabaseWait", () => {
  it("reads the seconds", () => {
    expect(
      parseSupabaseWait("For security purposes, you can only request this after 42 seconds."),
    ).toBe(42);
  });
  it("returns null otherwise", () => {
    expect(parseSupabaseWait("email rate limit exceeded")).toBeNull();
  });
});
