"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getBuiltinFormats,
  getCustomFormats,
  mergeFormats,
  type ExamFormat,
} from "@/app/lib/examFormats";

// Render-safe format list: built-ins on the first render (server and client
// agree, so hydration holds), customs merged in after mount. Every render
// path that lists or resolves formats uses this — never getAllFormats or
// resolveFormat during render.
export function useFormats(): ExamFormat[] {
  const [customs, setCustoms] = useState<ExamFormat[]>([]);
  useEffect(() => {
    // localStorage is a browser-only external store; one-off read on mount is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustoms(getCustomFormats());
  }, []);
  return useMemo(() => mergeFormats(getBuiltinFormats(), customs), [customs]);
}

// True once the client has hydrated (when localStorage customs are
// readable). Gates UI that resolves a format id, so a custom format doesn't
// flash as missing/built-in on the first render.
export function useFormatsLoaded(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
