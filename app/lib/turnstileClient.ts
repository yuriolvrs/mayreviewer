// Browser half of the Turnstile check (see turnstile.ts). Gets a fresh
// one-time token right before an AI request. Most visitors pass without
// seeing anything; a suspicious session gets a small checkbox at the bottom
// of the screen. With no NEXT_PUBLIC_TURNSTILE_SITE_KEY, sends nothing.

import { TURNSTILE_HEADER } from "./turnstile";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
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

export async function turnstileHeaders(): Promise<Record<string, string>> {
  if (!SITE_KEY) return {};
  const turnstile = await loadTurnstile();
  const host = document.createElement("div");
  host.className = "turnstile-host";
  document.body.append(host);
  let widgetId: string | undefined;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      const fail = () => reject(new Error("The bot check didn't pass. Try again."));
      widgetId = turnstile.render(host, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        callback: resolve,
        "error-callback": fail,
        "expired-callback": fail,
        "timeout-callback": fail,
      });
    });
    return { [TURNSTILE_HEADER]: token };
  } finally {
    if (widgetId) turnstile.remove(widgetId);
    host.remove();
  }
}
