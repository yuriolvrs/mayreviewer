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
    const host = target.closest(".turnstile-host") as HTMLElement;
    expect(host).not.toBeNull();
    opts["before-interactive-callback"]();
    expect(host.textContent).toContain(t.CHALLENGE_TEXT);
    expect(host.querySelector(".turnstile-box[data-loading] .turnstile-spinner")).not.toBeNull();
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

describe("fetchWithTurnstile", () => {
  const init = { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"a":1}' };
  const required = () => Response.json({ code: "turnstile_required" }, { status: 403 });
  const hint = (ms: number) => {
    document.cookie = `mr_pass_exp=${Date.now() + ms}; path=/`;
  };

  afterEach(() => {
    document.cookie = "mr_pass_exp=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    vi.unstubAllGlobals();
  });

  it("sends no token while the hint is valid", async () => {
    const t = await load();
    hint(10 * 60_000);
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await t.fetchWithTurnstile("/api/x", init);
    const sent = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(sent.headers).get("x-turnstile-token")).toBeNull();
    expect(sent.body).toBe('{"a":1}');
  });

  it("gets a token when the hint ends within the margin", async () => {
    const t = await load();
    hint(10_000);
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const p = t.fetchWithTurnstile("/api/x", init);
    await vi.advanceTimersByTimeAsync(0);
    opts.callback("tok");
    await p;
    const sent = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new Headers(sent.headers).get("x-turnstile-token")).toBe("tok");
  });

  it("retries once with a token after turnstile_required, resending the body", async () => {
    const t = await load();
    hint(10 * 60_000);
    const fetchMock = vi.fn().mockResolvedValueOnce(required()).mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const p = t.fetchWithTurnstile("/api/x", init);
    await vi.advanceTimersByTimeAsync(0);
    opts.callback("tok2");
    const res = await p;
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls.map((c) => c[1] as RequestInit);
    expect(new Headers(first.headers).get("x-turnstile-token")).toBeNull();
    expect(new Headers(second.headers).get("x-turnstile-token")).toBe("tok2");
    expect(second.body).toBe('{"a":1}');
  });

  it("does not retry when the request already carried a token", async () => {
    const t = await load();
    const fetchMock = vi.fn(async () => required());
    vi.stubGlobal("fetch", fetchMock);
    const p = t.fetchWithTurnstile("/api/x", init);
    await vi.advanceTimersByTimeAsync(0);
    opts.callback("tok");
    const res = await p;
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a second time, an unrelated 403, or without a site key", async () => {
    const t = await load();
    hint(10 * 60_000);
    const twice = vi.fn(async () => required());
    vi.stubGlobal("fetch", twice);
    const p = t.fetchWithTurnstile("/api/x", init);
    await vi.advanceTimersByTimeAsync(0);
    opts.callback("tok");
    expect((await p).status).toBe(403);
    expect(twice).toHaveBeenCalledTimes(2);

    const other = vi.fn(async () => Response.json({ error: "x" }, { status: 403 }));
    vi.stubGlobal("fetch", other);
    await t.fetchWithTurnstile("/api/x", init);
    expect(other).toHaveBeenCalledTimes(1);

    const plain = await load("");
    const refused = vi.fn(async () => required());
    vi.stubGlobal("fetch", refused);
    await plain.fetchWithTurnstile("/api/x", init);
    expect(refused).toHaveBeenCalledTimes(1);
  });
});
