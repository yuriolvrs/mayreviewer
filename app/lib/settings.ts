import { DEFAULT_QUESTION_COUNT, MAX_QUESTION_COUNT, MIN_QUESTION_COUNT } from "@/app/lib/questions";
import {
  DEFAULT_DAILY_GOAL,
  DEFAULT_STREAK_STATE,
  MAX_DAILY_GOAL,
  MIN_DAILY_GOAL,
  ensureMonthlyGrant,
  normalizeStreakState,
  type StreakState,
} from "@/app/lib/streaks";
import { notifyLocalChange } from "@/app/lib/localChange";
import type { FeedbackMode, FontSizePreference, ThemePreference, UserSettings } from "@/app/types";

// The ONLY file that touches localStorage for settings. Swapping to Supabase
// later means rewriting the insides of these functions, not the components.
export const SETTINGS_KEY = "mayreviewer-settings";
// When the settings were last changed on this device. Compared against the
// cloud row's updated_at for last-write-wins; kept beside the settings (not
// inside them) so normalizeSettings never has to know about it.
const SETTINGS_UPDATED_AT_KEY = "mayreviewer-settings-updated-at";
// Fired on window whenever replaceSettings applies a cloud-winning set, so
// live pages (Settings) re-read instead of showing stale controls.
export const SETTINGS_CHANGED_EVENT = "mayreviewer:settings-changed";

export const DEFAULT_SETTINGS: UserSettings = {
  feedbackMode: "immediate",
  defaultCount: DEFAULT_QUESTION_COUNT,
  shuffle: true,
  theme: "system",
  fontSize: "normal",
  reduceMotion: false,
  remindersEnabled: false,
  reminderTime: "19:00",
  dailyGoal: DEFAULT_DAILY_GOAL,
  streak: DEFAULT_STREAK_STATE,
  proTier: "free",
};

function isFeedbackMode(value: unknown): value is FeedbackMode {
  return value === "immediate" || value === "end-only";
}

function isTheme(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function isFontSize(value: unknown): value is FontSizePreference {
  return value === "normal" || value === "large";
}

function clampCount(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : NaN;
  if (Number.isNaN(n)) return DEFAULT_SETTINGS.defaultCount;
  return Math.min(Math.max(n, MIN_QUESTION_COUNT), MAX_QUESTION_COUNT);
}

function clampGoal(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : NaN;
  if (Number.isNaN(n)) return DEFAULT_SETTINGS.dailyGoal;
  return Math.min(Math.max(n, MIN_DAILY_GOAL), MAX_DAILY_GOAL);
}

function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

// Backfills defaults for settings saved before a field existed, and clamps
// anything out of range — same normalize-on-read pattern as storage.ts.
export function normalizeSettings(value: unknown): UserSettings {
  const v = (typeof value === "object" && value !== null ? value : {}) as Partial<UserSettings>;
  return {
    feedbackMode: isFeedbackMode(v.feedbackMode) ? v.feedbackMode : DEFAULT_SETTINGS.feedbackMode,
    defaultCount: clampCount(v.defaultCount),
    shuffle: typeof v.shuffle === "boolean" ? v.shuffle : DEFAULT_SETTINGS.shuffle,
    theme: isTheme(v.theme) ? v.theme : DEFAULT_SETTINGS.theme,
    fontSize: isFontSize(v.fontSize) ? v.fontSize : DEFAULT_SETTINGS.fontSize,
    reduceMotion: typeof v.reduceMotion === "boolean" ? v.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    remindersEnabled: typeof v.remindersEnabled === "boolean" ? v.remindersEnabled : DEFAULT_SETTINGS.remindersEnabled,
    reminderTime: isTimeString(v.reminderTime) ? v.reminderTime : DEFAULT_SETTINGS.reminderTime,
    dailyGoal: clampGoal(v.dailyGoal),
    streak: normalizeStreakState(v.streak),
    proTier: "free",
  };
}

function readStored(): unknown {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function getSettings(): UserSettings {
  return normalizeSettings(readStored());
}

// The streak bank with the monthly top-up applied — persisted when the month
// rolls over, so every surface (home strip, Progress) reads the same bank.
// Idempotent: outside a rollover this is a pure read.
export function getStreakState(): StreakState {
  const settings = getSettings();
  const granted = ensureMonthlyGrant(settings.streak, new Date());
  if (granted.grantedMonth !== settings.streak.grantedMonth) {
    return updateSettings({ streak: granted }).streak;
  }
  return granted;
}

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  const stored = readStored();
  const base = typeof stored === "object" && stored !== null ? stored : {};
  const updated = normalizeSettings({ ...base, ...patch });
  const stampedAt = new Date().toISOString();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    try {
      window.localStorage.setItem(SETTINGS_UPDATED_AT_KEY, stampedAt);
    } catch {
      // Best-effort: the settings themselves are already saved; only the
      // sync comparison loses precision.
    }
  }
  applySettingsToDocument(updated);
  // replaceSettings (sync's own writer) deliberately does not notify.
  notifyLocalChange();
  return updated;
}

export function getSettingsUpdatedAt(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SETTINGS_UPDATED_AT_KEY);
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}T/.test(raw) ? raw : null;
}

// Sync-only writer: stores a cloud-winning set verbatim with its own stamp
// (stamping "now" here would make the pulled set look locally newer and flip
// the next comparison). Applies to the document and notifies live pages.
export function replaceSettings(settings: UserSettings, updatedAt: string | null): UserSettings {
  const normalized = normalizeSettings(settings);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
    try {
      if (updatedAt) {
        window.localStorage.setItem(SETTINGS_UPDATED_AT_KEY, updatedAt);
      } else {
        window.localStorage.removeItem(SETTINGS_UPDATED_AT_KEY);
      }
    } catch {
      // Best-effort (see updateSettings).
    }
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }
  applySettingsToDocument(normalized);
  return normalized;
}

// Resolves "system" against the OS preference. Pure so tests can cover it.
export function resolveTheme(settings: UserSettings, systemDark: boolean): "light" | "dark" {
  if (settings.theme === "light") return "light";
  if (settings.theme === "dark") return "dark";
  return systemDark ? "dark" : "light";
}

// Applies theme + font-size + motion to the document. Guarded for SSR.
export function applySettingsToDocument(settings: UserSettings): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  // jsdom (unit tests) and old browsers have no matchMedia — default to light.
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  const resolved = resolveTheme(settings, systemDark);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.fontSize = settings.fontSize;
  document.documentElement.dataset.reduceMotion = settings.reduceMotion ? "true" : "false";
  document.documentElement.style.colorScheme = resolved;
}
