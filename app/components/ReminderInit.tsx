"use client";

import { useEffect } from "react";
import { REMINDER_FIRED_KEY, shouldFireReminder, todayKey } from "@/app/lib/reminders";
import { getSettings } from "@/app/lib/settings";

// Fifteen minutes is plenty precise for a daily nudge, and cheap.
const CHECK_INTERVAL_MS = 15 * 60_000;

// Fires the local study reminder when its time passes. Runs on mount and on
// an interval — reminders only fire while the app is open (or an installed
// PWA is running), which the Settings copy already says.
export default function ReminderInit() {
  useEffect(() => {
    function check() {
      if (typeof Notification === "undefined") return;
      const settings = getSettings();
      if (!settings.remindersEnabled || Notification.permission !== "granted") return;
      let lastFired: string | null = null;
      try {
        lastFired = window.localStorage.getItem(REMINDER_FIRED_KEY);
      } catch {
        lastFired = null;
      }
      const now = new Date();
      if (!shouldFireReminder(now, settings.reminderTime, lastFired)) return;
      try {
        new Notification("Time to review", {
          body: "Open May Reviewer for a quick practice round.",
        });
        window.localStorage.setItem(REMINDER_FIRED_KEY, todayKey(now));
      } catch {
        // Notifications are best-effort; a blocked or failed show must never
        // break the app. The fired stamp stays unset so it retries next check.
      }
    }
    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
