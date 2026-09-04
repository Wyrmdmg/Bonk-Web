import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

export type Todo = {
  id: string;
  user_id: string;
  text: string;
  done: boolean;
  is_public: boolean;
  created_at: string;
};

type Filter = "own" | "public";

export function useTodos(userId: string | null | undefined, filter: Filter = "own") {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = useCallback(async () => {
    if (!userId) {
      setTodos([]);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("todos" as never)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (filter === "public") q = q.eq("is_public", true);
    const { data, error } = await q;
    setLoading(false);
    if (error) return;
    setTodos((data ?? []) as unknown as Todo[]);
  }, [userId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`todos-${userId}-${filter}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "todos", filter: `user_id=eq.${userId}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, filter, load]);

  const add = useCallback(
    async (text: string, isPublic: boolean) => {
      if (!userId) return;
      const t = text.trim();
      if (!t) return;
      // Optimistic
      const optimistic: Todo = {
        id: `tmp-${Date.now()}`,
        user_id: userId,
        text: t,
        done: false,
        is_public: isPublic,
        created_at: new Date().toISOString(),
      };
      if (filterRef.current === "own" || (filterRef.current === "public" && isPublic)) {
        setTodos((cur) => [optimistic, ...cur]);
      }
      const { data, error } = await supabase
        .from("todos" as never)
        .insert({ user_id: userId, text: t, is_public: isPublic } as never)
        .select()
        .single();
      if (error) {
        setTodos((cur) => cur.filter((x) => x.id !== optimistic.id));
        toast.error(error.message);
        return;
      }
      setTodos((cur) => cur.map((x) => (x.id === optimistic.id ? (data as unknown as Todo) : x)));
    },
    [userId],
  );

  const toggle = useCallback(
    async (id: string, done: boolean) => {
      setTodos((cur) => cur.map((x) => (x.id === id ? { ...x, done } : x)));
      const { error } = await supabase
        .from("todos" as never)
        .update({ done } as never)
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        load();
      }
    },
    [load],
  );

  const setPublic = useCallback(
    async (id: string, isPublic: boolean) => {
      setTodos((cur) => {
        if (filterRef.current === "public" && !isPublic) return cur.filter((x) => x.id !== id);
        return cur.map((x) => (x.id === id ? { ...x, is_public: isPublic } : x));
      });
      const { error } = await supabase
        .from("todos" as never)
        .update({ is_public: isPublic } as never)
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        load();
      }
    },
    [load],
  );

  const remove = useCallback(
    async (id: string) => {
      const prev = todos;
      setTodos((cur) => cur.filter((x) => x.id !== id));
      const { error } = await supabase
        .from("todos" as never)
        .delete()
        .eq("id", id);
      if (error) {
        toast.error(error.message);
        setTodos(prev);
      }
    },
    [todos],
  );

  return { todos, loading, add, toggle, setPublic, remove, reload: load };
}
