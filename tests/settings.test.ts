// @vitest-environment jsdom
// settings.ts reads and writes localStorage, so these need a DOM global.
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  applySettingsToDocument,
  getSettings,
  normalizeSettings,
  resolveTheme,
  updateSettings,
} from "@/app/lib/settings";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-font-size");
  document.documentElement.removeAttribute("data-reduce-motion");
});

describe("getSettings", () => {
  it("returns defaults when nothing is stored", () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults for corrupt JSON rather than throwing", () => {
    localStorage.setItem(SETTINGS_KEY, "{not json");
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("backfills fields missing from older stored settings", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: "dark" }));
    const settings = getSettings();
    expect(settings.theme).toBe("dark");
    expect(settings.feedbackMode).toBe(DEFAULT_SETTINGS.feedbackMode);
    expect(settings.defaultCount).toBe(DEFAULT_SETTINGS.defaultCount);
    expect(settings.proTier).toBe("free");
  });
});

describe("updateSettings", () => {
  it("merges the patch without disturbing untouched fields", () => {
    updateSettings({ theme: "dark" });
    const settings = updateSettings({ feedbackMode: "end-only" });
    expect(settings.theme).toBe("dark");
    expect(settings.feedbackMode).toBe("end-only");
  });

  it("clamps defaultCount into range", () => {
    expect(updateSettings({ defaultCount: 999 }).defaultCount).toBe(200);
    expect(updateSettings({ defaultCount: 0 }).defaultCount).toBe(1);
    expect(updateSettings({ defaultCount: Number.NaN }).defaultCount).toBe(
      DEFAULT_SETTINGS.defaultCount,
    );
  });

  it("rejects unknown enum values back to defaults", () => {
    const settings = updateSettings({
      theme: "neon" as never,
      feedbackMode: "later" as never,
      reminderTime: "nope" as never,
    });
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.feedbackMode).toBe(DEFAULT_SETTINGS.feedbackMode);
    expect(settings.reminderTime).toBe(DEFAULT_SETTINGS.reminderTime);
  });

  it("keeps proTier pinned to free", () => {
    const settings = updateSettings({ proTier: "pro" as never });
    expect(settings.proTier).toBe("free");
  });
});

describe("normalizeSettings", () => {
  it("normalizes non-objects to defaults", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });
});

describe("resolveTheme", () => {
  it("follows explicit light/dark and system otherwise", () => {
    expect(resolveTheme({ ...DEFAULT_SETTINGS, theme: "light" }, true)).toBe("light");
    expect(resolveTheme({ ...DEFAULT_SETTINGS, theme: "dark" }, false)).toBe("dark");
    expect(resolveTheme({ ...DEFAULT_SETTINGS, theme: "system" }, true)).toBe("dark");
    expect(resolveTheme({ ...DEFAULT_SETTINGS, theme: "system" }, false)).toBe("light");
  });
});

describe("applySettingsToDocument", () => {
  it("sets data attributes on the document", () => {
    applySettingsToDocument({ ...DEFAULT_SETTINGS, theme: "dark", fontSize: "large", reduceMotion: true });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.fontSize).toBe("large");
    expect(document.documentElement.dataset.reduceMotion).toBe("true");
  });
});
