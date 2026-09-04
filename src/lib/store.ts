import { useCallback, useSyncExternalStore } from "react";

/**
 * One value under one browser key, kept in step across every window that reads
 * it.
 *
 * `deskstore.ts` next door does the same job for a list of records, which is
 * the shape notes, journal and calendar want. This is for the things that are
 * one value: a syllabus tree, a schedule table, a list of exams. Splitting
 * them is not duplication, it is that a list of `{id, updated}` rows and a
 * plain value want different reads.
 *
 * Browser storage, not the database, for the same reason deskstore
 * gives. What it costs is real and worth stating plainly: this lives in this
 * browser, on this machine, and clearing site data clears it. That is why
 * Display Properties has an export button.
 *
 * The site renders on the server first, where there is no localStorage and no
 * window. Every read is guarded, and `use()` hands React the same function for
 * the server snapshot as for the client one, so the first client render agrees
 * with the HTML that arrived and nothing flashes.
 */
export function makeStore<T>(key: string, fallback: T, revive?: (raw: unknown) => T) {
  const listeners = new Set<() => void>();
  // useSyncExternalStore compares snapshots by identity, so read() has to hand
  // back the same object every time or React re-renders forever.
  let cache: T | undefined;

  function read(): T {
    if (cache !== undefined) return cache;
    if (typeof localStorage === "undefined") return fallback;
    try {
      const raw = localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : undefined;
      cache = parsed === undefined ? fallback : revive ? revive(parsed) : (parsed as T);
    } catch {
      cache = fallback;
    }
    return cache as T;
  }

  /** The server has no storage, so it always sees the fallback. Reading the
   *  cache here instead would make the HTML depend on whichever request
   *  happened to warm it first. */
  const readServer = () => fallback;

  function write(next: T) {
    cache = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Quota, or a locked down profile. The value is still right for this
      // session; only the remembering is lost.
    }
    for (const l of listeners) l();
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent("wd:store", { detail: key }));
  }

  function subscribe(fn: () => void) {
    listeners.add(fn);
    // Another window of the same site is a separate React tree with its own
    // listener set, and a second tab is a separate document entirely.
    const onOther = (e: Event) => {
      if ((e as CustomEvent<string>).detail === key) fn();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = undefined;
        fn();
      }
    };
    window.addEventListener("wd:store", onOther);
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(fn);
      window.removeEventListener("wd:store", onOther);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    get: read,
    set: write,
    update: (fn: (prev: T) => T) => write(fn(read())),
    subscribe,
    use: () => useSyncExternalStore(subscribe, read, readServer),
    /** For the importer, which writes the key underneath and needs the next
     *  read to go back to storage rather than to a stale cache. */
    reload: () => {
      cache = undefined;
      for (const l of listeners) l();
    },
    key,
  };
}

export type Store<T> = ReturnType<typeof makeStore<T>>;

export function useStore<T>(store: Store<T>): [T, (next: T | ((prev: T) => T)) => void] {
  const value = store.use();
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      typeof next === "function" ? store.update(next as (p: T) => T) : store.set(next),
    [store],
  );
  return [value, set];
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
