import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { usePoll } from "@/lib/poll";
import { toast } from "sonner";

export type Progression = {
  xp: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  lastFocusDate: string | null;
  refresh: () => Promise<unknown>;
  ready: boolean;
};

export function useProgression(userId: string | null | undefined): Progression {
  const [data, setData] = useState<Omit<Progression, "refresh" | "ready"> | null>(null);
  // Track last-seen xp/coins so we can toast on any increase, regardless of
  // whether this client observed the cycle transition that awarded them.
  const lastSeen = useRef<{ xp: number; coins: number } | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setData(null);
      lastSeen.current = null;
      return;
    }
    const { data: p, error } = await supabase
      .from("profiles")
      .select("xp, coins, current_streak, longest_streak, last_focus_date")
      .eq("id", userId)
      .maybeSingle();
    if (error) return false;
    if (!p) return;
    const xp = p.xp ?? 0;
    const coins = p.coins ?? 0;
    const prev = lastSeen.current;
    if (prev) {
      const dXp = xp - prev.xp;
      const dCoins = coins - prev.coins;
      if (dXp > 0 || dCoins > 0) {
        const parts: string[] = [];
        if (dXp > 0) parts.push(`+${dXp} XP`);
        if (dCoins > 0) parts.push(`+${dCoins} coins`);
        toast.success(parts.join(" · "), { id: `prog-${xp}-${coins}` });
      }
    }
    lastSeen.current = { xp, coins };
    setData({
      xp,
      coins,
      currentStreak: p.current_streak ?? 0,
      longestStreak: p.longest_streak ?? 0,
      lastFocusDate: p.last_focus_date ?? null,
    });
    return true;
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setData(null);
      lastSeen.current = null;
      return;
    }
    lastSeen.current = null;
    load();
    const channelName = `prog-${userId}-${Math.random().toString(36).slice(2, 10)}`;
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  // Safety net for a dropped realtime socket. This polled every 4s on every
  // page that shows XP or coins, which is most of them - it was the query that
  // showed up as a 504 when the connection pool ran dry. Realtime delivers the
  // update the moment it happens, so this only has to catch a dead socket.
  usePoll(load, 20_000, !!userId);

  return useMemo(
    () => ({
      xp: data?.xp ?? 0,
      coins: data?.coins ?? 0,
      currentStreak: data?.currentStreak ?? 0,
      longestStreak: data?.longestStreak ?? 0,
      lastFocusDate: data?.lastFocusDate ?? null,
      ready: data !== null,
      refresh: load,
    }),
    [data, load],
  );
}
