import { describe, expect, it } from "vitest";
import { shouldFireReminder, todayKey } from "@/app/lib/reminders";

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
