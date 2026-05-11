import type { DebugEntry } from "./types";

type Listener = (entries: DebugEntry[]) => void;
const listeners = new Set<Listener>();
const entries: DebugEntry[] = [];

export function addEntry(entry: Omit<DebugEntry, "id" | "ts">) {
  const full: DebugEntry = {
    ...entry,
    id: Math.random().toString(36).slice(2),
    ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
  };
  entries.unshift(full); // newest first
  if (entries.length > 100) entries.pop();
  listeners.forEach((fn) => fn([...entries]));
}

export function subscribe(fn: Listener) {
  listeners.add(fn);
  fn([...entries]);
  return () => listeners.delete(fn);
}
