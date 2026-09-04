import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getEquippedBadges } from "@/lib/badges.functions";

export type OwnedBadge = {
  id: string;
  badge_key: string;
  purchased_at: string;
  expires_at: string;
  equipped: boolean;
};

// Owner-side hook: my badges, with realtime updates. Filters out expired.
export function useMyBadges(userId: string | undefined) {
  const [badges, setBadges] = useState<OwnedBadge[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBadges([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_badges")
      .select("id, badge_key, purchased_at, expires_at, equipped")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .order("purchased_at", { ascending: false });
    setBadges((data ?? []) as OwnedBadge[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const ch = supabase
      .channel(`ub-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_badges", filter: `user_id=eq.${userId}` },
        () => {
          refresh();
        },
      )
      .subscribe();
    // Periodic re-tick to drop items that just expired.
    const t = setInterval(refresh, 60 * 1000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(t);
    };
  }, [userId, refresh]);

  const equipped = badges.find((b) => b.equipped) ?? null;
  return { badges, equipped, loading, refresh };
}

// For rendering other users' equipped badges. Reads a purpose-scoped view
// that only exposes currently-equipped, non-expired rows with minimal columns.
export function useEquippedBadgesFor(userIds: string[]) {
  const key = userIds.slice().sort().join(",");
  const [map, setMap] = useState<Record<string, string>>({});
  const loadEquipped = useServerFn(getEquippedBadges);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (userIds.length === 0) {
        setMap({});
        return;
      }
      const data = await loadEquipped({ data: { userIds } }).catch(() => []);
      if (cancelled) return;
      const out: Record<string, string> = {};
      for (const row of (data ?? []) as Array<{ user_id: string; badge_key: string }>)
        out[row.user_id] = row.badge_key;
      setMap(out);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadEquipped]);
  return map;
}
