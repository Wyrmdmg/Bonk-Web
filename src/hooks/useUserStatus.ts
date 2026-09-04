import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { StringKey } from "@/lib/i18n";

export type UserStatus = "online" | "idle" | "dnd" | "invisible" | "offline";

const PREF_KEY = "bonk.status-pref";

function readPref(): UserStatus {
  try {
    const v = localStorage.getItem(PREF_KEY) as UserStatus | null;
    if (v && ["online", "idle", "dnd", "invisible", "offline"].includes(v)) return v;
  } catch {
    /* ignore */
  }
  return "online";
}

// Only status. A client may update exactly two columns of its own profile,
// display_name and status, and last_seen is not one of them, so sending both
// made Postgres reject the whole statement and no status ever persisted. The
// column is also read nowhere: staleness comes from bonk_presence.last_seen,
// which the server writes with its own role.
async function writeStatus(userId: string, s: UserStatus) {
  try {
    // `neq` is the whole point. Postgres does not skip an UPDATE that changes
    // nothing: it writes a new row version, writes WAL for it, updates every
    // index, and leaves a dead tuple for autovacuum to come back and clean up.
    // Every heartbeat and every return to the tab was paying that in full to
    // store a value already sitting in the row. With the filter the statement
    // matches no rows and the disk sees nothing.
    await supabase.from("profiles").update({ status: s }).eq("id", userId).neq("status", s);
  } catch {
    /* ignore */
  }
}

export function useUserStatus(userId: string | null | undefined) {
  // `status` here is the user's *preference* (what they chose). The DB reflects
  // live presence: DB = preference while the tab is open; DB = "offline" once
  // they close/leave. Members list treats DB "offline"/"invisible" as offline.
  const [status, setStatus] = useState<UserStatus>(() =>
    typeof window !== "undefined" ? readPref() : "online",
  );
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Whether the idle timer has already fired, so activity knows there is a
   *  transition to write rather than a value to re-assert. */
  const wentIdle = useRef(false);

  // Apply preference to DB when it changes / on mount.
  useEffect(() => {
    if (!userId) return;
    writeStatus(userId, status);
    try {
      localStorage.setItem(PREF_KEY, status);
    } catch {
      /* ignore */
    }
  }, [userId, status]);

  // Mark offline on tab close / navigation away.
  useEffect(() => {
    if (!userId) return;
    const goOffline = () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`;
        const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const body = new Blob([JSON.stringify({ status: "offline" })], {
          type: "application/json",
        });
        // sendBeacon can't set custom headers; fall back to fetch keepalive.
        fetch(url, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${key}`,
            Prefer: "return=minimal",
          },
          body,
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    };
    const onPageHide = () => goOffline();
    const onBeforeUnload = () => goOffline();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Restore preference when returning to the tab.
        const pref = readPref();
        writeStatus(userId, pref);
        setStatus(pref);
      }
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId]);

  // Auto-idle after 5 minutes of no activity (only when preference is "online").
  useEffect(() => {
    if (!userId) return;
    const IDLE_MS = 5 * 60 * 1000;
    const bump = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      // If user manually set idle/dnd/invisible/offline, don't override.
      const pref = readPref();
      if (pref !== "online") return;
      // Only the transition back from idle is worth a write. This used to fire
      // on every event in the list below, and `mousemove` alone is dozens a
      // second, so moving the cursor across the page sent dozens of UPDATEs to
      // set a column that already said "online". That was the single largest
      // source of write traffic in the app.
      if (wentIdle.current) {
        wentIdle.current = false;
        writeStatus(userId, "online");
      }
      idleTimer.current = setTimeout(() => {
        if (readPref() !== "online") return;
        wentIdle.current = true;
        writeStatus(userId, "idle");
      }, IDLE_MS);
    };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    bump();
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [userId]);

  // Heartbeat: re-assert the chosen status every 45s, so a tab left open keeps
  // saying "online" and a status changed in another tab is not clobbered.
  useEffect(() => {
    if (!userId) return;
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      const pref = readPref();
      try {
        await supabase.from("profiles").update({ status: pref }).eq("id", userId);
      } catch {
        /* ignore */
      }
    };
    const iv = setInterval(beat, 45_000);
    return () => clearInterval(iv);
  }, [userId]);

  const update = useCallback((next: UserStatus) => {
    setStatus(next);
  }, []);

  return { status, setStatus: update };
}

export const STATUS_META: Record<UserStatus, { label: StringKey; dot: string }> = {
  online: { label: "statusOnline", dot: "bg-[var(--moss)]" },
  idle: { label: "statusIdle", dot: "bg-[var(--sage)]" },
  dnd: { label: "statusDnd", dot: "bg-[var(--flame)]" },
  invisible: { label: "statusInvisible", dot: "bg-[var(--hairline)]" },
  offline: { label: "statusOffline", dot: "bg-[var(--disabled)]" },
};
