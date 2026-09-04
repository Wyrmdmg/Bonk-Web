import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

export type Notification = {
  id: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications(userId: string | null | undefined) {
  const [items, setItems] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, type, link, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as Notification[]) ?? []);
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }
    load();
    const ch = supabase
      .channel(`notif-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  const unread = items.filter((n) => !n.read_at).length;

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  }, []);

  const remove = useCallback(async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  const clearAll = useCallback(async () => {
    if (!userId) return;
    await supabase.from("notifications").delete().eq("user_id", userId);
  }, [userId]);

  return { items, unread, markAllRead, markRead, remove, clearAll };
}
