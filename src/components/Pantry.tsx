import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getFood } from "@/lib/foods";
import { useServerFn } from "@tanstack/react-start";
import { renameFood, eatFood } from "@/lib/progression.functions";
import { toast } from "sonner";
import { Pencil, Check, X, Utensils } from "lucide-react";
import { useT } from "@/lib/i18n";

type UserFood = { id: string; food_key: string; custom_name: string | null; obtained_at: string };

export function Pantry({ userId, editable }: { userId: string; editable: boolean }) {
  const { t } = useT();
  const [items, setItems] = useState<UserFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [eatingId, setEatingId] = useState<string | null>(null);
  const rename = useServerFn(renameFood);
  const eat = useServerFn(eatFood);

  const load = async () => {
    const { data } = await supabase
      .from("user_foods")
      .select("id, food_key, custom_name, obtained_at")
      .eq("user_id", userId)
      .order("obtained_at", { ascending: false });
    setItems((data as UserFood[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [userId]);

  useEffect(() => {
    const ch = supabase
      .channel(`pantry-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_foods", filter: `user_id=eq.${userId}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  if (loading) return <p className="label-caps">{t("loadingPantry")}</p>;

  if (items.length === 0) {
    return (
      <div className="panel p-6 text-center font-mono text-[13px] text-[var(--ink-soft)]">
        {editable ? t("pantryEmpty") : t("noFoodYet")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {items.map((it) => {
        const def = getFood(it.food_key);
        if (!def) return null;
        const label = it.custom_name?.trim() || t(def.name);
        const isEditing = editingId === it.id;
        const isEating = eatingId === it.id;
        return (
          <article key={it.id} className="group panel flex flex-col" title={t(def.perk)}>
            <div className="titlebar">
              <span className="truncate">{t(def.name)}</span>
              <span className="font-data text-[var(--bone-soft)]">+{def.xp}</span>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-3">
              <div className="sprite-frame">
                <img
                  src={def.url}
                  alt={label}
                  width={56}
                  height={56}
                  className="pixel"
                  loading="lazy"
                />
              </div>
              {isEditing ? (
                <div className="flex w-full items-center gap-1">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={40}
                    className="min-w-0 flex-1 border-2 border-[var(--ink)] bg-transparent px-2 py-1 font-mono text-[11px]"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await rename({ data: { userFoodId: it.id, name: draft } });
                        // The row has to be patched here. Eating does the same a
                        // few lines down, but renaming left the old name on
                        // screen until the page was reopened: the only other
                        // thing that refreshes this list is a realtime channel on
                        // user_foods, and that table is not in the publication,
                        // so it connects and never fires.
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id ? { ...x, custom_name: draft.trim() || null } : x,
                          ),
                        );
                        setEditingId(null);
                        toast.success(t("renamed"));
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : t("failed"));
                      }
                    }}
                    className="border-2 border-[var(--ink)] bg-[var(--ink)] p-1 text-[var(--bone)]"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="border-2 border-[var(--ink)] p-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-1">
                  <div className="truncate font-mono text-[13px]">{label}</div>
                  <div className="font-mono text-[11px] leading-snug text-[var(--ink-soft)]">
                    {t(def.perk)}
                  </div>
                </div>
              )}
              {editable && !isEditing && (
                <div className="mt-auto flex w-full items-center gap-2">
                  <button
                    disabled={isEating}
                    onClick={async () => {
                      setEatingId(it.id);
                      try {
                        const res = await eat({ data: { userFoodId: it.id } });
                        setItems((prev) => prev.filter((x) => x.id !== it.id));
                        toast.success(`${t("ate")} ${label} · +${res.gained} XP`);
                      } catch (e: unknown) {
                        toast.error(e instanceof Error ? e.message : t("failed"));
                      } finally {
                        setEatingId(null);
                      }
                    }}
                    className="btn-base btn-secondary flex-1 gap-1"
                  >
                    <Utensils className="h-3 w-3" /> {t("eat")} +{def.xp}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(it.id);
                      setDraft(it.custom_name ?? "");
                    }}
                    className="shrink-0 border-2 border-[var(--ink)] p-1.5 opacity-40 group-hover:opacity-100"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
