import type { User } from "@supabase/supabase-js";

export const MIN_PASSWORD_LENGTH = 6;

function providerList(user: User): string[] {
  const fromMeta = Array.isArray(user.app_metadata?.providers) ? (user.app_metadata.providers as string[]) : [];
  const fromIdentities = (user.identities ?? []).map((i) => i.provider);
  return [...new Set([...fromMeta, ...fromIdentities])];
}

export function hasProvider(user: User, name: string): boolean {
  return providerList(user).includes(name);
}

// Supabase adds no "email" provider when an OAuth user sets a password, so we
// record `password_set` in user_metadata ourselves after a successful set.
export function hasPassword(user: User): boolean {
  return hasProvider(user, "email") || user.user_metadata?.password_set === true;
}

export function validateNewPassword(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next !== confirm) return "Passwords don't match.";
  return null;
}

// Reset-link limits. These only shape the UI. Supabase's own rate limits are
// the real guard, and the project owner sets them in the dashboard.
export const RESET_COOLDOWN_SECONDS = 60;
export const RESET_MAX_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

// Seconds to wait before another send (0 = allowed).
export function resetLinkWait(sentAt: number[], now: number): number {
  const recent = sentAt.filter((t) => now - t < HOUR_MS).sort((a, b) => a - b);
  if (recent.length === 0) return 0;
  const cooldown = Math.max(0, recent[recent.length - 1] + RESET_COOLDOWN_SECONDS * 1000 - now);
  let capWait = 0;
  if (recent.length >= RESET_MAX_PER_HOUR) {
    const oldest = recent[recent.length - RESET_MAX_PER_HOUR];
    capWait = Math.max(0, oldest + HOUR_MS - now);
  }
  return Math.ceil(Math.max(cooldown, capWait) / 1000);
}

// True when the hourly cap, not the cooldown, is what blocks a send.
export function resetCapReached(sentAt: number[], now: number): boolean {
  return sentAt.filter((t) => now - t < HOUR_MS).length >= RESET_MAX_PER_HOUR;
}

function resetKey(email: string): string {
  return `mayreviewer-pw-reset:${email.toLowerCase()}`;
}

export function readResetSends(email: string, now = Date.now()): number[] {
  try {
    const raw = localStorage.getItem(resetKey(email));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is number => typeof t === "number" && now - t < HOUR_MS);
  } catch {
    return [];
  }
}

export function recordResetSend(email: string, now: number): void {
  try {
    const next = [...readResetSends(email, now), now];
    localStorage.setItem(resetKey(email), JSON.stringify(next));
  } catch {
    // No storage: behave as if there is no history.
  }
}

// Supabase says: "For security purposes, you can only request this after 42 seconds."
export function parseSupabaseWait(message: string): number | null {
  const match = /after (\d+) seconds?/i.exec(message);
  return match ? Number(match[1]) : null;
}
