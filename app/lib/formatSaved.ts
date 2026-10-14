const KEY = "mayreviewer-format-saved";

// One-shot flag: the builder sets it before leaving, /formats reads it once
// and shows a "Format saved" status line. sessionStorage can be blocked, so
// every access is guarded and the flag is only a convenience.
export function flagFormatSaved(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // The status line is optional.
  }
}

export function consumeFormatSaved(): boolean {
  try {
    const set = sessionStorage.getItem(KEY) === "1";
    if (set) sessionStorage.removeItem(KEY);
    return set;
  } catch {
    return false;
  }
}
