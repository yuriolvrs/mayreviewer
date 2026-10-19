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
export default function TurnstileSlot() {
  const needsClick = useSyncExternalStore(subscribeTurnstile, isTurnstileInteractive, () => false);
  return (
    <div className={needsClick ? "flex w-full flex-col items-center gap-2" : undefined}>
      {needsClick && (
        <p role="status" className="text-[0.9375rem] font-medium text-text-primary">
          {CHALLENGE_TEXT}
        </p>
      )}
      <div ref={setTurnstileSlot} />
    </div>
  );
}
