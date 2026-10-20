// Browser half of the Turnstile check (see turnstile.ts). Gets a fresh
// one-time token right before an AI request. Most visitors pass without
// seeing anything; a suspicious session gets a small checkbox. It shows inside
// the open modal (see TurnstileSlot), or floats above the page when none is
// open. With no NEXT_PUBLIC_TURNSTILE_SITE_KEY, sends nothing.

import { PASS_EXP_COOKIE, TURNSTILE_HEADER, TURNSTILE_REQUIRED_CODE } from "./turnstileShared";

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
  // The widget renders into a box that reserves its space (with a spinner) once
  // Cloudflare asks for a click, before the checkbox is drawn.
  let floating: HTMLElement | null = null;
  let box: HTMLElement | null = null;
  let target = slot;
  if (!target) {
    floating = document.createElement("div");
    floating.className = "turnstile-host";
    box = document.createElement("div");
    box.className = "turnstile-box";
    target = document.createElement("div");
    box.append(target);
    floating.append(box);
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
          if (floating && box) {
            note = document.createElement("p");
            note.textContent = CHALLENGE_TEXT;
            floating.prepend(note);
            box.setAttribute("data-loading", "");
            const spinner = document.createElement("div");
            spinner.className = "turnstile-spinner";
            spinner.textContent = "Loading check…";
            box.prepend(spinner);
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

// The pass cookie itself is HttpOnly; this readable hint says when it ends.
// Only a hint: the server decides, and a wrong hint costs one retry.
const PASS_MARGIN_MS = 30_000;

function passLooksValid(): boolean {
  const entry = document.cookie.split(";").find((c) => c.trim().startsWith(`${PASS_EXP_COOKIE}=`));
  const expMs = Number(entry?.split("=")[1]);
  return Number.isFinite(expMs) && expMs > Date.now() + PASS_MARGIN_MS;
}

async function needsNewCheck(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const data = (await res.clone().json()) as { code?: unknown };
    return data.code === TURNSTILE_REQUIRED_CODE;
  } catch {
    return false;
  }
}

// fetch() for the AI routes. Sends no token while the pass cookie is valid,
// and retries once with a fresh token when the server asks for one. The init
// must be reusable (callers pass a string body); the signal stays shared.
export async function fetchWithTurnstile(url: string, init: RequestInit = {}): Promise<Response> {
  const send = (extra: Record<string, string>) => {
    const headers = new Headers(init.headers);
    for (const [k, v] of Object.entries(extra)) headers.set(k, v);
    return fetch(url, { ...init, headers });
  };
  if (!SITE_KEY) return send({});

  const withToken = !passLooksValid();
  const res = await send(withToken ? await turnstileHeaders() : {});
  if (withToken || !(await needsNewCheck(res))) return res;
  return send(await turnstileHeaders());
}
