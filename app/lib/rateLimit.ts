// Fixed-window rate limiting for the one route that costs money to call.
//
// Counters live in this process's memory. That's the right fit for the
// single-instance deploy this app runs on, but it is NOT a distributed limiter:
// on a multi-instance or serverless host each instance keeps its own counters,
// so the effective limit multiplies by the instance count. Moving to a shared
// store (Redis/Upstash) means replacing the Map below, not the callers.

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

  return function check(key: string, now = Date.now()): RateLimitResult {
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      // Sweep on window rollover rather than on a timer: without this a stream
      // of one-request-each IPs would grow the map forever.
      for (const [k, b] of buckets) {
        if (now >= b.resetAt) buckets.delete(k);
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
