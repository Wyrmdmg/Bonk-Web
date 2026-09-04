import { useCallback, useEffect, useState } from "react";

// Local storage for the three desk apps, notes, journal and calendar. One
// module because they are the same shape: a keyed bag of records that has to
// survive a reload, be edited from a window that can be closed at any moment,
// and stay in step when two windows show the same data.
//
// This is localStorage, not the database. The three apps have no
// schema, no RLS policy and no server functions yet, and one browser key is a
// much smaller change than three tables for features whose shape is still
// moving, the same call the companion makes. What it costs is real
// and worth stating plainly: entries live in this browser, on this machine.
// The upgrade path is a `user_docs` table (kind, id, payload jsonb, updated_at)
// with an owner policy, and this module becoming its cache.

export type Doc = { id: string; updated: number };

const listeners = new Set<() => void>();

function notify(key: string) {
  for (const l of listeners) l();
  // Other windows of the same app are separate React trees.
  window.dispatchEvent(new CustomEvent("wd:deskstore", { detail: key }));
}

function read<T extends Doc>(key: string): T[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T extends Doc>(key: string, rows: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // Quota, or private mode. The in-memory list is still correct for this
    // session, so the app keeps working and only the persistence is lost.
  }
  notify(key);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/**
 * A list of records under one storage key, kept in step across every window
 * that reads it. Returns the rows newest-first plus the three writes any of
 * these apps needs.
 */
export function useDocs<T extends Doc>(key: string) {
  const [rows, setRows] = useState<T[]>([]);

  const sync = useCallback(() => setRows(read<T>(key)), [key]);

  useEffect(() => {
    sync();
    const onLocal = () => sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) sync();
    };
    listeners.add(onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onLocal);
      window.removeEventListener("storage", onStorage);
    };
  }, [key, sync]);

  const save = useCallback(
    (row: T) => {
      const next = read<T>(key);
      const at = next.findIndex((r) => r.id === row.id);
      const stamped = { ...row, updated: Date.now() };
      if (at >= 0) next[at] = stamped;
      else next.unshift(stamped);
      write(key, next);
      return stamped;
    },
    [key],
  );

  const remove = useCallback(
    (id: string) =>
      write(
        key,
        read<T>(key).filter((r) => r.id !== id),
      ),
    [key],
  );

  return { rows, save, remove, reload: sync };
}
