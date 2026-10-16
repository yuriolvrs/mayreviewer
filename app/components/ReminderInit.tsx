"use client";

import { useEffect } from "react";
import {
  DEFAULT_REMINDER_BODY,
  REMINDER_FIRED_KEY,
  reminderBody,
  shouldFireReminder,
  todayKey,
} from "@/app/lib/reminders";
import { getSettings, getStreakState } from "@/app/lib/settings";
import { getAllQuizHistory } from "@/app/lib/storage";
import { streakStatus } from "@/app/lib/streaks";

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
      void showReminder()
        .then(() => window.localStorage.setItem(REMINDER_FIRED_KEY, todayKey(now)))
        .catch(() => {
          // Notifications are best-effort; a blocked or failed show must never
          // break the app. The fired stamp stays unset so it retries next check.
        });
    }
    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  return null;
}

const TITLE = "Time to review";

// Reads the streak at fire time. Any failure gives the default text.
function currentBody(): string {
  try {
    const state = getStreakState();
    const status = streakStatus(getAllQuizHistory(), state, new Date());
    return reminderBody(status, state.banked);
  } catch {
    return DEFAULT_REMINDER_BODY;
  }
}

// Android Chrome throws on `new Notification()` — pages there must show
// notifications through a service worker registration. Use the worker when
// one is active, and fall back to the constructor (desktop, dev mode).
async function showReminder(): Promise<void> {
  const options: NotificationOptions = { body: currentBody() };
  const registration =
    "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration) {
    await registration.showNotification(TITLE, options);
    return;
  }
  new Notification(TITLE, options);
}
