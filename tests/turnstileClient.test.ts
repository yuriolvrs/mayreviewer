// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Opts = Record<string, (...a: unknown[]) => void>;

let opts: Opts;
let target: HTMLElement;
const remove = vi.fn();

async function load(siteKey = "site") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
  return import("@/app/lib/turnstileClient");
}

beforeEach(() => {
  vi.useFakeTimers();
  remove.mockClear();
  window.turnstile = {
    render: (el, options) => {
      target = el;
      opts = options as unknown as Opts;
      return "w1";
    },
    remove,
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete window.turnstile;
  document.body.innerHTML = "";
});

describe("turnstileHeaders", () => {
  it("returns {} and renders nothing without a site key", async () => {
    const t = await load("");
    expect(await t.turnstileHeaders()).toEqual({});
    expect(document.querySelector(".turnstile-host")).toBeNull();
  });

  it("passes silently with no interactive state", async () => {
    const t = await load();
    const listener = vi.fn();
    t.subscribeTurnstile(listener);
    const p = t.turnstileHeaders();
    await vi.advanceTimersByTimeAsync(0);
    opts.callback("tok");
    expect(await p).toEqual({ "x-turnstile-token": "tok" });
    expect(listener).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("w1");
    expect(document.querySelector(".turnstile-host")).toBeNull();
  });

  it("notifies when interactive starts and ends, and renders into the slot", async () => {
    const t = await load();
    const slot = document.createElement("div");
    t.setTurnstileSlot(slot);
    const listener = vi.fn();
    t.subscribeTurnstile(listener);
    const p = t.turnstileHeaders();
    await vi.advanceTimersByTimeAsync(0);
    expect(target).toBe(slot);
    opts["before-interactive-callback"]();
    expect(t.isTurnstileInteractive()).toBe(true);
    opts["after-interactive-callback"]();
    expect(t.isTurnstileInteractive()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    opts.callback("tok");
    await p;
  });

  it("floats a host with a note when no modal is open", async () => {
    const t = await load();
    const p = t.turnstileHeaders();
    await vi.advanceTimersByTimeAsync(0);
    expect(target.className).toBe("turnstile-host");
    opts["before-interactive-callback"]();
    expect(target.textContent).toContain(t.CHALLENGE_TEXT);
    opts.callback("tok");
    await p;
    expect(document.querySelector(".turnstile-host")).toBeNull();
  });

  it("times out 60s after the widget became interactive and cleans up", async () => {
    const t = await load();
    const p = t.turnstileHeaders();
    const assertion = expect(p).rejects.toThrow("The bot check timed out");
    await vi.advanceTimersByTimeAsync(0);
    opts["before-interactive-callback"]();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(t.isTurnstileInteractive()).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(t.isTurnstileInteractive()).toBe(false);
    expect(remove).toHaveBeenCalledWith("w1");
  });

  it("keeps the existing message for real errors", async () => {
    const t = await load();
    const p = t.turnstileHeaders();
    const assertion = expect(p).rejects.toThrow("The bot check didn't pass. Try again.");
    await vi.advanceTimersByTimeAsync(0);
    opts["error-callback"]();
    await assertion;
  });
});
