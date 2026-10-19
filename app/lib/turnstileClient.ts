// Browser half of the Turnstile check (see turnstile.ts). Gets a fresh
// one-time token right before an AI request. Most visitors pass without
// seeing anything; a suspicious session gets a small checkbox. It shows inside
// the open modal (see TurnstileSlot), or floats above the page when none is
// open. With no NEXT_PUBLIC_TURNSTILE_SITE_KEY, sends nothing.

import { TURNSTILE_HEADER } from "./turnstile";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export const CHALLENGE_TEXT = "Quick check: tick the box to continue";
// How long a visible checkbox waits for a click before the request gives up.
const INTERACTIVE_TIMEOUT_MS = 60_000;
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("The bot check failed to load."));
    script.onerror = () => {
      // Lets a later attempt try again, e.g. after the connection comes back.
      scriptPromise = null;
      script.remove();
      reject(new Error("Couldn't load the bot check. Check your connection and try again."));
    };
    document.head.append(script);
  });
  return scriptPromise;
}

// The open modal registers an element here; the widget renders into it so the
// checkbox sits inside the dialog instead of under its backdrop.
let slot: HTMLElement | null = null;
let interactive = false;
const listeners = new Set<() => void>();

export function setTurnstileSlot(el: HTMLElement | null) {
  slot = el;
}

export function subscribeTurnstile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isTurnstileInteractive(): boolean {
  return interactive;
}

function setInteractive(value: boolean) {
  if (interactive === value) return;
  interactive = value;
  listeners.forEach((l) => l());
}

export async function turnstileHeaders(): Promise<Record<string, string>> {
  if (!SITE_KEY) return {};
  const turnstile = await loadTurnstile();
  // With no modal open, float the widget above everything, with its own note.
  let floating: HTMLElement | null = null;
  const target = slot ?? (floating = document.createElement("div"));
  if (floating) {
    floating.className = "turnstile-host";
    document.body.append(floating);
  }
  let note: HTMLElement | null = null;
  let widgetId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      const fail = () => reject(new Error("The bot check didn't pass. Try again."));
      widgetId = turnstile.render(target, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        callback: resolve,
        "error-callback": fail,
        "expired-callback": fail,
        "timeout-callback": fail,
        "before-interactive-callback": () => {
          setInteractive(true);
          if (floating) {
            note = document.createElement("p");
            note.textContent = CHALLENGE_TEXT;
            floating.prepend(note);
          }
          clearTimeout(timer);
          timer = setTimeout(
            () =>
              reject(
                new Error("The bot check timed out. Tick the box when it appears, then try again."),
              ),
            INTERACTIVE_TIMEOUT_MS,
          );
        },
        "after-interactive-callback": () => {
          setInteractive(false);
          (note as HTMLElement | null)?.remove();
        },
      });
    });
    return { [TURNSTILE_HEADER]: token };
  } finally {
    clearTimeout(timer);
    setInteractive(false);
    if (widgetId) turnstile.remove(widgetId);
    floating?.remove();
  }
}
