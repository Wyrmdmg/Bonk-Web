import { useMemo, useState } from "react";
import { Check, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useTodos } from "@/hooks/useTodos";
import { useT } from "@/lib/i18n";

type Props = {
  userId: string | null | undefined;
  editable: boolean;
  /** When true, only show public todos (used for viewing someone else's list). */
  publicOnly?: boolean;
  /** Default is_public value for newly added todos (owner mode). */
  defaultPublic?: boolean;
  title?: string;
  emptyLabel?: string;
  compact?: boolean;
  /** Keep undone tasks pinned on top. Default true. */
  autoSort?: boolean;
  /** Max height (Tailwind class) applied to the scrollable list. */
  maxHeightClass?: string;
};

export function TodoList({
  userId,
  editable,
  publicOnly = false,
  defaultPublic = false,
  title,
  emptyLabel,
  compact = false,
  autoSort = true,
  maxHeightClass = "max-h-64",
}: Props) {
  const { t } = useT();
  const { todos, add, toggle, setPublic, remove } = useTodos(userId, publicOnly ? "public" : "own");
  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(defaultPublic);

  const sorted = useMemo(() => {
    if (!autoSort) return todos;
    return [...todos].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [todos, autoSort]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await add(text, isPublic);
    setText("");
  };

  return (
    <section className="panel flex min-h-0 flex-col">
      {title !== "" && (
        <div className="titlebar">
          <span>{title ?? t("todo")}</span>
          <span className="font-data text-[var(--bone-soft)]">
            {String(todos.length).padStart(2, "0")}
          </span>
        </div>
      )}

      {editable && (
        <form
          onSubmit={submit}
          className={`flex items-center gap-2 ${compact ? "p-4" : "p-5"} pb-3`}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            placeholder={t("addTask")}
            className="min-w-0 flex-1 border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-mono text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={() => setIsPublic((v) => !v)}
            className={`btn-base btn-tertiary gap-1 ${isPublic ? "seg-on" : ""}`}
            title={isPublic ? t("newTasksPublic") : t("newTasksPrivate")}
          >
            {isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {isPublic ? t("public") : t("private")}
          </button>
          <button type="submit" className="btn-base btn-secondary gap-1">
            <Plus className="h-3.5 w-3.5" /> {t("add")}
          </button>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="label-caps p-5 text-center">{emptyLabel ?? t("nothingHereYet")}</p>
      ) : (
        <ul className={`flex flex-col overflow-y-auto ${maxHeightClass}`}>
          {sorted.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-2.5 last:border-b-0"
            >
              <button
                disabled={!editable}
                onClick={() => toggle(item.id, !item.done)}
                className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 border-[var(--ink)] disabled:cursor-default ${item.done ? "seg-on" : ""}`}
                aria-label={item.done ? t("markNotDone") : t("markDone")}
              >
                {item.done && <Check className="h-3 w-3" />}
              </button>
              <span
                className={`min-w-0 flex-1 font-mono text-[13px] ${item.done ? "text-[var(--disabled)] line-through" : ""}`}
              >
                {item.text}
              </span>
              {editable && (
                <>
                  <button
                    onClick={() => setPublic(item.id, !item.is_public)}
                    className={`shrink-0 ${item.is_public ? "" : "text-[var(--ink-soft)] opacity-60"}`}
                    title={item.is_public ? t("publicClickPrivate") : t("privateClickPublic")}
                  >
                    {item.is_public ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="shrink-0 text-[var(--ink-soft)] opacity-0 group-hover:opacity-100 hover:text-[var(--flame)]"
                    title={t("delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {!editable && item.is_public && (
                <Eye
                  className="h-3.5 w-3.5 shrink-0 text-[var(--ink-soft)]"
                  aria-label={t("public")}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
