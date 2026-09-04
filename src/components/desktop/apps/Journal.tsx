import { useEffect, useMemo, useRef, useState } from "react";
import { useDocs, type Doc } from "@/lib/deskstore";
import { useT, type StringKey } from "@/lib/i18n";
import { playSound } from "@/lib/sound";

// The journal. One entry per day, addressed by date rather than by a list -
// that is the whole difference between a journal and a pile of notes, and it
// is why the day strip is the navigation instead of a sidebar of titles.
//
// No images, by request. What is here instead is the part people actually come
// back for: a prompt when the page is blank, a mood, and a streak that counts
// days written rather than words typed.

type Entry = Doc & { text: string; mood?: number };

const KEY = "wd.journal";

/** id is the day itself, so writing twice in a day edits one entry. */
const dayId = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MOODS = ["😖", "😕", "😐", "🙂", "😄"];

const PROMPTS: StringKey[] = [
  "jrPrompt1",
  "jrPrompt2",
  "jrPrompt3",
  "jrPrompt4",
  "jrPrompt5",
  "jrPrompt6",
];

export function Journal() {
  const { lang, t } = useT();
  const { rows, save, remove } = useDocs<Entry>(KEY);
  const [day, setDay] = useState(() => new Date());
  const ta = useRef<HTMLTextAreaElement>(null);

  const id = dayId(day);
  const entry = rows.find((e) => e.id === id) ?? null;
  const wordCount = words(entry?.text ?? "");
  const isToday = id === dayId(new Date());

  // A stable prompt per day, so it does not shuffle while you are looking at it.
  const prompt = PROMPTS[Math.abs(hash(id)) % PROMPTS.length];

  const written = useMemo(
    () => new Set(rows.filter((e) => e.text.trim()).map((e) => e.id)),
    [rows],
  );
  const streak = useMemo(() => {
    let n = 0;
    const d = new Date();
    // Today not being written yet must not break a run that is still alive.
    if (!written.has(dayId(d))) d.setDate(d.getDate() - 1);
    while (written.has(dayId(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }, [written]);

  // The last fourteen days, oldest first, ending on the day being viewed.
  const strip = useMemo(() => {
    const out: Date[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(day);
      d.setDate(d.getDate() - i);
      out.push(d);
    }
    return out;
  }, [day]);

  useEffect(() => {
    ta.current?.focus();
  }, [id]);

  const put = (patch: Partial<Entry>) => {
    const next: Entry = { id, text: entry?.text ?? "", ...entry, ...patch, updated: Date.now() };
    // An emptied entry is a deleted one, so a stray keystroke cannot pad a streak.
    if (!next.text.trim() && next.mood == null) remove(id);
    else save(next);
  };

  const shift = (n: number) => {
    const d = new Date(day);
    d.setDate(d.getDate() + n);
    if (d > new Date()) return; // there is nothing to write in tomorrow
    setDay(d);
    playSound("nav");
  };

  return (
    <div className="jr">
      <div className="jr-head">
        <button className="jr-arrow" onClick={() => shift(-1)} aria-label={t("previousDay")}>
          ◄
        </button>
        <div className="jr-date">
          <b>{day.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}</b>
          <span>
            {isToday ? t("today") : day.toLocaleDateString(lang, { year: "numeric" })}
            {streak > 0 && ` · ${streak} ${t("jrDayStreak")}`}
          </span>
        </div>
        <button
          className="jr-arrow"
          onClick={() => shift(1)}
          disabled={isToday}
          aria-label={t("nextDay")}
        >
          ►
        </button>
      </div>

      <div className="jr-strip">
        {strip.map((d) => {
          const k = dayId(d);
          return (
            <button
              key={k}
              className={`jr-day ${k === id ? "is-on" : ""} ${written.has(k) ? "is-written" : ""}`}
              onClick={() => setDay(d)}
              title={d.toLocaleDateString(lang, { dateStyle: "medium" })}
            >
              <em>{d.toLocaleDateString(lang, { weekday: "narrow" })}</em>
              <span>{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div className="jr-moods">
        <span className="label-caps">{t("jrMood")}</span>
        {MOODS.map((face, i) => (
          <button
            key={face}
            className={`jr-mood ${entry?.mood === i ? "is-on" : ""}`}
            onClick={() => put({ mood: entry?.mood === i ? undefined : i })}
            aria-pressed={entry?.mood === i}
            aria-label={`${t("jrMood")} ${i + 1}`}
          >
            {face}
          </button>
        ))}
      </div>

      <textarea
        ref={ta}
        className="jr-edit"
        value={entry?.text ?? ""}
        spellCheck
        placeholder={t(prompt)}
        onChange={(e) => put({ text: e.target.value })}
      />

      <div className="jr-foot">
        <span>
          {wordCount} {t(wordCount === 1 ? "notesWord" : "notesWords")}
        </span>
        <span>
          {written.size} {t(written.size === 1 ? "jrEntry" : "jrEntries")}
        </span>
        <span>{t("notesSaved")}</span>
      </div>
    </div>
  );
}

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
