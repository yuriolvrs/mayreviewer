import { DEFAULT_QUESTION_COUNT, MAX_QUESTION_COUNT, MIN_QUESTION_COUNT } from "@/app/lib/questions";
import type { FeedbackMode, FontSizePreference, ThemePreference, UserSettings } from "@/app/types";

// The ONLY file that touches localStorage for settings. Swapping to Supabase
// later means rewriting the insides of these functions, not the components.
export const SETTINGS_KEY = "mayreviewer-settings";

export const DEFAULT_SETTINGS: UserSettings = {
  feedbackMode: "immediate",
  defaultCount: DEFAULT_QUESTION_COUNT,
  shuffle: true,
  theme: "system",
  fontSize: "normal",
  reduceMotion: false,
  remindersEnabled: false,
  reminderTime: "19:00",
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

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  const stored = readStored();
  const base = typeof stored === "object" && stored !== null ? stored : {};
  const updated = normalizeSettings({ ...base, ...patch });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  }
  applySettingsToDocument(updated);
  return updated;
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
