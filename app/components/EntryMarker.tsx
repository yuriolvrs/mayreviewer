"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ENTERED_KEY } from "@/app/components/EntryScript";

// Reading pages a landing visitor may open without starting to use the app.
const NOT_ENTERING = ["/", "/about", "/privacy", "/terms", "/goodbye"];

// Marks the visitor as entered once they reach any app route. Updates <html>
// too: EntryScript runs only on a full page load, and a client-side
// navigation back to "/" must show the reviewers home, not the landing.
export default function EntryMarker() {
  const pathname = usePathname();
  useEffect(() => {
    if (NOT_ENTERING.includes(pathname)) return;
    document.documentElement.dataset.entry = "app";
    try {
      window.localStorage.setItem(ENTERED_KEY, "1");
    } catch {
      // Storage blocked: the marker on <html> still covers this session.
    }
  }, [pathname]);
  return null;
}
