// Local-only reminder scheduling. No server, no push: the app checks on load
// (and on an interval) whether today's reminder time has passed and fires a
// Notification once per day. The fired date lives in localStorage beside the
// setting that enables it.

export const REMINDER_FIRED_KEY = "mayreviewer-reminder-fired";

export function todayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

// Pure so tests can cover the edges: fires once the scheduled time has passed
// today and stays quiet before it or after firing already.
export function shouldFireReminder(now: Date, time: string, lastFired: string | null): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(hours, minutes, 0, 0);
  return now >= scheduled && lastFired !== todayKey(now);
}
