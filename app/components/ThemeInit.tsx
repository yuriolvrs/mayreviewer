"use client";

import { useEffect } from "react";
import { applySettingsToDocument, getSettings } from "@/app/lib/settings";

// Applies stored settings to <html> on first paint and re-applies when the
// OS theme changes while preference is "system". One-off read on mount is
// intentional — settings writes re-apply synchronously via updateSettings.
export default function ThemeInit() {
  useEffect(() => {
    applySettingsToDocument(getSettings());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      applySettingsToDocument(getSettings());
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return null;
}
