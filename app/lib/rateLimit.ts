import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Fixed-window rate limiting for the routes that spend AI quota or Blob space.
//
// Two layers. createRateLimiter keeps counters in this process's memory: on
// Vercel each serverless instance has its own, so alone it lets the limit
// multiply by the instance count. createSharedRateLimiter puts the counters in
// Upstash Redis so every instance shares one count, and falls back to the
// in-memory limiter when Upstash isn't configured (local dev) or doesn't
// answer in time — a limiter outage must never take generation down.

type Bucket = { count: number; resetAt: number };

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  // Seconds until the current window rolls over. 0 while allowed.
  retryAfterSeconds: number;
};

export type RateLimiter = (key: string, now?: number) => RateLimitResult;

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const buckets = new Map<string, Bucket>();
  // Caps the map so a stream of spoofed IPs can't grow it forever.
  const MAX_KEYS = 10_000;

  return function check(rawKey: string, now = Date.now()): RateLimitResult {
    const key = normalizeKey(rawKey);
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      // Sweep on window rollover rather than on a timer: without this a stream
      // of one-request-each IPs would grow the map forever.
      for (const [k, b] of buckets) {
        if (now >= b.resetAt) buckets.delete(k);
      }
      if (buckets.size >= MAX_KEYS) {
        // Evict the oldest entry rather than growing without bound.
        const oldest = buckets.keys().next().value;
        if (oldest !== undefined) buckets.delete(oldest);
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }

    bucket.count++;
    if (bucket.count > limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1),
      };
    }
    return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
  };
}

function normalizeKey(rawKey: string): string {
  return rawKey.trim().toLowerCase().slice(0, 64) || "unknown";
}

export type SharedRateLimiter = (key: string) => Promise<RateLimitResult>;

// Upstash answers over HTTP in a few ms from the same region. Past this, the
// request falls back to the in-memory count rather than waiting.
const SHARED_TIMEOUT_MS = 1000;

// `name` keeps each route's counters apart in the shared store. Reads the
// env names Upstash uses directly and the ones the Vercel integration sets.
export function createSharedRateLimiter(name: string, limit: number, windowMs: number): SharedRateLimiter {
  const local = createRateLimiter(limit, windowMs);
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return async (key) => local(key);

  const shared = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.fixedWindow(limit, `${windowMs} ms`),
    prefix: `mayreviewer:ratelimit:${name}`,
    timeout: SHARED_TIMEOUT_MS,
  });
  return async (rawKey) => {
    const key = normalizeKey(rawKey);
    try {
      const result = await shared.limit(key);
      return {
        allowed: result.success,
        remaining: result.remaining,
        retryAfterSeconds: result.success ? 0 : Math.max(Math.ceil((result.reset - Date.now()) / 1000), 1),
      };
    } catch {
      return local(key);
    }
  };
}

// Only meaningful behind a proxy that sets these headers and strips
// client-supplied ones (Vercel, nginx, Cloudflare all do). A directly exposed
// origin would let a caller spoof `x-forwarded-for` and mint a fresh bucket per
// request — this limiter is abuse *friction*, not an authentication boundary.
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
