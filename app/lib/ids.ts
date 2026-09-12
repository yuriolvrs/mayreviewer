// crypto.randomUUID needs a secure context. On plain http LAN or old
// browsers it throws or is missing — fall back so id minting never breaks.
export function newId(): string {
  const uuid = (globalThis.crypto as Crypto | undefined)?.randomUUID;
  if (typeof uuid === "function") {
    try {
      return uuid.call(globalThis.crypto);
    } catch {
      // Fall through to the insecure fallback below.
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}
