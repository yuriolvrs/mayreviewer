// Names shared by the server check (turnstile.ts) and the browser half
// (turnstileClient.ts). Kept free of server-only imports so the client bundle
// can use it.

export const TURNSTILE_HEADER = "x-turnstile-token";
// Readable by page script. Holds the pass expiry (epoch ms) as a hint only.
export const PASS_EXP_COOKIE = "mr_pass_exp";
// Error code in a 403 body when the route needs a fresh bot check.
export const TURNSTILE_REQUIRED_CODE = "turnstile_required";
