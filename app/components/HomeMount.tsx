"use client";

import { useEffect, useState } from "react";
import ReviewersHome from "@/app/components/ReviewersHome";

// Mounts the reviewers home only for returning visitors (EntryScript's
// data-entry="app"). Mounting it hidden under the landing would still run its
// effects — the empty state's one-time greeting would be spent unseen.
export default function HomeMount() {
  const [isApp, setIsApp] = useState(false);
  useEffect(() => {
    // The <html> attribute is set before hydration; reading it is a one-off sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsApp(document.documentElement.dataset.entry === "app");
  }, []);
  return isApp ? <ReviewersHome /> : null;
}
