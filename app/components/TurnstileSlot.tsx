"use client";

import { useSyncExternalStore } from "react";
import {
  CHALLENGE_TEXT,
  isTurnstileInteractive,
  setTurnstileSlot,
  subscribeTurnstile,
} from "@/app/lib/turnstileClient";

// Where the Turnstile checkbox renders while a modal waits on the bot check.
// The note shows only when Cloudflare asks for a click; a silent pass adds nothing.
// While the click box loads, its space is reserved with a small spinner that the
// real checkbox covers once drawn.
export default function TurnstileSlot() {
  const needsClick = useSyncExternalStore(subscribeTurnstile, isTurnstileInteractive, () => false);
  return (
    <div className={needsClick ? "flex w-full flex-col items-center gap-2" : undefined}>
      {needsClick && (
        <p role="status" className="text-[0.9375rem] font-medium text-text-primary">
          {CHALLENGE_TEXT}
        </p>
      )}
      <div className="turnstile-box" data-loading={needsClick ? "" : undefined}>
        {needsClick && <div className="turnstile-spinner">Loading check…</div>}
        <div ref={setTurnstileSlot} />
      </div>
    </div>
  );
}
