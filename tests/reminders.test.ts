import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMINDER_BODY,
  reminderBody,
  shouldFireReminder,
  todayKey,
} from "@/app/lib/reminders";
import type { StreakStatus } from "@/app/lib/streaks";

function status(kind: StreakStatus["kind"], count = 0, remaining = 0): StreakStatus {
  return { kind, count, restoredCount: 0, remaining };
}

describe("reminderBody", () => {
  it("warns when the streak is pending", () => {
    expect(reminderBody(status("pending", 5, 3), 0)).toBe(
      "Your 5-day streak ends tonight. Answer 3 more to keep it.",
    );
  });

  it("uses 1-day for a one-day streak", () => {
    expect(reminderBody(status("pending", 1, 2), 0)).toContain("Your 1-day streak");
  });

  it("offers a restore when restorable and a restore is banked", () => {
    expect(reminderBody(status("restorable", 7), 1)).toBe(
      "Your 7-day streak ended yesterday. Open the app to restore it.",
    );
  });

  it("uses the default text when restorable with none banked", () => {
    expect(reminderBody(status("restorable", 7), 0)).toBe(DEFAULT_REMINDER_BODY);
  });

  it("uses the default text for safe and none", () => {
    expect(reminderBody(status("safe", 4), 2)).toBe(DEFAULT_REMINDER_BODY);
    expect(reminderBody(status("none"), 2)).toBe(DEFAULT_REMINDER_BODY);
  });
});

function at(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2026, 8, 12, h, m, 0, 0);
  return d;
}

describe("todayKey", () => {
  it("stamps the local calendar day", () => {
    expect(todayKey(at("19:00"))).toBe("2026-09-12");
  });
});

describe("shouldFireReminder", () => {
  it("fires once the scheduled time has passed and stays quiet before it", () => {
    expect(shouldFireReminder(at("19:00"), "19:00", null)).toBe(true);
    expect(shouldFireReminder(at("20:30"), "19:00", null)).toBe(true);
    expect(shouldFireReminder(at("18:59"), "19:00", null)).toBe(false);
  });

  it("fires only once per day", () => {
    expect(shouldFireReminder(at("20:00"), "19:00", "2026-09-12")).toBe(false);
  });

  it("fires again the next day", () => {
    const next = new Date(2026, 8, 13, 19, 30, 0, 0);
    expect(shouldFireReminder(next, "19:00", "2026-09-12")).toBe(true);
  });

  it("rejects a malformed time", () => {
    expect(shouldFireReminder(at("20:00"), "nope", null)).toBe(false);
  });
});
