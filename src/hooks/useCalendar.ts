import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

// The calendar's rows, which live in the database rather than this browser so
// that signing in somewhere else shows the same month. Everything is scoped by
// RLS to the signed-in user; the client never filters for privacy, it filters
// so the query is small.

export type CalEvent = {
  id: string;
  day: string;
  at: string;
  mins: number;
  title: string;
  note: string | null;
  tone: number;
};

// The migration has not been run yet. PostgREST answers from its own schema
// cache (PGRST205) before the query ever reaches Postgres, so the plain
// "relation does not exist" code only shows up on the paths that bypass it.
const MISSING_TABLE = ["PGRST205", "42P01"];

export function useCalendar(userId: string | null | undefined) {
  const [rows, setRows] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("calendar_events" as never)
      .select("id, day, at, mins, title, note, tone")
      .eq("user_id", userId)
      .order("day", { ascending: true });
    setLoading(false);
    if (error) {
      const gone = MISSING_TABLE.includes(error.code);
      setMissing(gone);
      if (!gone) console.error("[calendar] load:", error);
      return;
    }
    setMissing(false);
    setRows((data ?? []) as unknown as CalEvent[]);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back to the tab refetches. This used to be a realtime subscription,
  // which was dead code: every live table here is named in an ALTER PUBLICATION
  // and calendar_events never was, so the channel connected and never fired.
  // Refetching on focus covers the case that actually happens, the same
  // account open in another tab or on another machine, and needs nothing
  // configured server-side to work.
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, load]);

  /** Insert when the row has no server id yet, update when it does. */
  const save = useCallback(
    async (ev: CalEvent) => {
      if (!userId) return;
      const fields = {
        day: ev.day,
        at: ev.at,
        mins: ev.mins,
        title: ev.title.trim(),
        note: ev.note?.trim() || null,
        tone: ev.tone,
      };
      const isNew = ev.id.startsWith("new-");
      setRows((cur) => (isNew ? [...cur, ev] : cur.map((r) => (r.id === ev.id ? ev : r))));
      const { data, error } = isNew
        ? await supabase
            .from("calendar_events" as never)
            .insert({ ...fields, user_id: userId } as never)
            .select("id, day, at, mins, title, note, tone")
            .single()
        : await supabase
            .from("calendar_events" as never)
            .update({ ...fields, updated_at: new Date().toISOString() } as never)
            .eq("id", ev.id)
            .select("id, day, at, mins, title, note, tone")
            .single();
      if (error) {
        toast.error(error.message);
        void load();
        return;
      }
      const saved = data as unknown as CalEvent;
      setRows((cur) => cur.map((r) => (r.id === ev.id ? saved : r)));
    },
    [userId, load],
  );

  const remove = useCallback(
    async (id: string) => {
      const prev = rows;
      setRows((cur) => cur.filter((r) => r.id !== id));
      const { error } = await supabase
        .from("calendar_events" as never)
        .delete()
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        setRows(prev);
      }
    },
    [rows],
  );

  return { rows, loading, missing, save, remove, reload: load };
}
