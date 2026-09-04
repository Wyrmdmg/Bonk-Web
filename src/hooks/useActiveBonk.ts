import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

// The room you are currently sitting in, if any. A user can only be in one
// active bonk at a time (bonks.functions enforces it), so this is a single row
// rather than a list.

export type ActiveBonk = { id: string; name: string };

export function useActiveBonk(userId: string | null | undefined) {
  const [bonk, setBonk] = useState<ActiveBonk | null>(null);

  useEffect(() => {
    if (!userId) {
      setBonk(null);
      return;
    }
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("bonk_members")
        .select("bonk:bonks!inner(id, name, status)")
        .eq("user_id", userId);
      if (!alive || error) return;
      const row = (data ?? []).find((m) => m.bonk?.status === "active");
      setBonk(row?.bonk ? { id: row.bonk.id, name: row.bonk.name } : null);
    };
    void load();
    // Joining and leaving happen through server functions, so there is no local
    // event to listen for, a slow poll is smaller than a realtime channel and
    // this only decides whether one card is on screen.
    // A 20s poll rather than a realtime subscription: swap it if the rail ever
    // needs to react faster than a room ends.
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [userId]);

  return bonk;
}
