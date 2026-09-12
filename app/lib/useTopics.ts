"use client";

import { useCallback, useState } from "react";
import { newId } from "@/app/lib/ids";

export type TopicRow = { id: string; value: string };

function toRows(values: string[]): TopicRow[] {
  return (values.length > 0 ? values : [""]).map((value) => ({ id: newId(), value }));
}

// Topic rows keyed by stable id instead of index: removing a middle row no
// longer shifts every row below it into a reused DOM node (which jumped
// focus and flashed the wrong overlay text). Callers read plain strings via
// `values()` when saving. Mutations are stable callbacks, so reseed effects
// can list them as deps without looping.
export function useTopicList(initial: string[]) {
  const [rows, setRows] = useState<TopicRow[]>(() => toRows(initial));

  const update = useCallback(
    (id: string, value: string) =>
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value } : r))),
    [],
  );
  const remove = useCallback(
    (id: string) => setRows((prev) => prev.filter((r) => r.id !== id)),
    [],
  );
  const add = useCallback(
    () => setRows((prev) => [...prev, { id: newId(), value: "" }]),
    [],
  );
  const reset = useCallback((values: string[]) => setRows(toRows(values)), []);

  return {
    rows,
    values: () => rows.map((r) => r.value),
    update,
    remove,
    add,
    reset,
  };
}
