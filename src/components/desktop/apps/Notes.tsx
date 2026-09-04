import { useEffect, useMemo, useRef, useState } from "react";
import { useDocs, uid, type Doc } from "@/lib/deskstore";
import { Markdown, docTitle, toggleTask } from "@/lib/markdown";
import { useT } from "@/lib/i18n";
import { playSound } from "@/lib/sound";

// Notes. A list on the left, one note on the right, markdown in and formatted
// text out, the shape Notion and its ancestors settled on because it is the
// one that survives a note growing from a line into a page.
//
// Write and Read are two modes rather than one live-preview pane: a preview
// beside the text doubles the width a note needs, and this window is 640px on
// a laptop. Checkboxes stay clickable in Read, which is the only thing a
// preview really has to be able to do.

type Note = Doc & { text: string; pinned?: boolean };

const KEY = "wd.notes";

const SNIPPETS = [
  { md: "# ", label: "mdH1" },
  { md: "## ", label: "mdH2" },
  { md: "- ", label: "mdBullet" },
  { md: "- [ ] ", label: "mdTask" },
  { md: "> ", label: "mdQuote" },
  { md: "**", label: "mdBold", wrap: true },
  { md: "`", label: "mdCode", wrap: true },
] as const;

export function Notes() {
  const { t } = useT();
  const { rows, save, remove } = useDocs<Note>(KEY);
  const [id, setId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"write" | "read">("write");
  const ta = useRef<HTMLTextAreaElement>(null);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated),
    [rows],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? sorted.filter((n) => n.text.toLowerCase().includes(needle)) : sorted;
  }, [sorted, q]);

  // Always land on something: the newest note, or a fresh empty one.
  useEffect(() => {
    if (id && rows.some((n) => n.id === id)) return;
    setId(sorted[0]?.id ?? null);
  }, [rows, sorted, id]);

  const note = rows.find((n) => n.id === id) ?? null;
  const wordCount = words(note?.text ?? "");

  const add = () => {
    const fresh: Note = { id: uid(), text: "", updated: Date.now() };
    save(fresh);
    setId(fresh.id);
    setMode("write");
    playSound("click");
    setTimeout(() => ta.current?.focus(), 0);
  };

  /** Wrap the selection, or insert at the caret, then put the caret back. */
  const apply = (md: string, wrap: boolean) => {
    const el = ta.current;
    if (!el || !note) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    const next = wrap
      ? value.slice(0, a) + md + value.slice(a, b) + md + value.slice(b)
      : value.slice(0, lineStart(value, a)) + md + value.slice(lineStart(value, a));
    save({ ...note, text: next });
    const caret = wrap ? b + md.length * 2 : b + md.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="nt">
      <div className="nt-list">
        <div className="nt-tools">
          <input
            className="nt-find"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("notesSearch")}
            aria-label={t("notesSearch")}
          />
          <button className="nt-new" onClick={add} title={t("notesNew")}>
            +
          </button>
        </div>
        <ul>
          {shown.map((n) => (
            <li key={n.id}>
              <button
                className={`nt-row ${n.id === id ? "is-on" : ""}`}
                onClick={() => setId(n.id)}
              >
                <span className="nt-row-title">
                  {n.pinned ? "📌 " : ""}
                  {docTitle(n.text, t("notesUntitled"))}
                </span>
                <span className="nt-row-date">{new Date(n.updated).toLocaleDateString()}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="nt-empty">{q ? t("notesNoMatch") : t("notesNone")}</li>
          )}
        </ul>
      </div>

      <div className="nt-main">
        {!note ? (
          <div className="nt-blank">
            <p>{t("notesNone")}</p>
            <button className="btn-base btn-primary" onClick={add}>
              {t("notesNew")}
            </button>
          </div>
        ) : (
          <>
            <div className="nt-bar">
              <div className="nt-modes">
                <button
                  className={mode === "write" ? "is-on" : ""}
                  onClick={() => setMode("write")}
                >
                  {t("notesWrite")}
                </button>
                <button className={mode === "read" ? "is-on" : ""} onClick={() => setMode("read")}>
                  {t("notesRead")}
                </button>
              </div>
              {mode === "write" &&
                SNIPPETS.map((s) => (
                  <button
                    key={s.label}
                    className="nt-fmt"
                    title={t(s.label)}
                    onClick={() => apply(s.md, "wrap" in s && s.wrap === true)}
                  >
                    {t(s.label)}
                  </button>
                ))}
              <button
                className={`nt-fmt ${note.pinned ? "is-on" : ""}`}
                onClick={() => save({ ...note, pinned: !note.pinned })}
                title={t("notesPin")}
              >
                📌
              </button>
              <button
                className="nt-fmt nt-del"
                onClick={() => {
                  remove(note.id);
                  playSound("click");
                }}
                title={t("delete")}
              >
                ✕
              </button>
            </div>

            {mode === "write" ? (
              <textarea
                ref={ta}
                className="nt-edit"
                value={note.text}
                spellCheck
                placeholder={t("notesPlaceholder")}
                onChange={(e) => save({ ...note, text: e.target.value })}
              />
            ) : (
              <div className="nt-read">
                <Markdown
                  text={note.text}
                  onToggle={(line) => save({ ...note, text: toggleTask(note.text, line) })}
                />
              </div>
            )}

            <div className="nt-status">
              <span>
                {wordCount} {t(wordCount === 1 ? "notesWord" : "notesWords")}
              </span>
              <span>{t("notesSaved")}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const lineStart = (s: string, at: number) => s.lastIndexOf("\n", Math.max(0, at - 1)) + 1;
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
