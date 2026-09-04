import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { useCalendar, type CalEvent } from "@/hooks/useCalendar";
import { useT } from "@/lib/i18n";
import { playSound } from "@/lib/sound";

// The calendar. Month grid on the left, the selected day's agenda on the right
//, the layout every calendar converged on because a month tells you where you
// are and a day tells you what you are doing.
//
// Times are stored as a plain "YYYY-MM-DD" and "HH:MM" rather than a Date. An
// event at 09:00 means nine in the morning wherever you open it; storing an
// instant would quietly move every entry when a timezone changed.
//
// The rows live in the database, not this browser, so the same account opened
// on another machine shows the same calendar. That is also why it asks you to
// sign in first: there is nowhere to put an anonymous person's events.

type Ev = CalEvent;

const TONES = ["var(--flame)", "var(--moss)", "var(--bar)", "#7c5cc4", "#b8860b"];

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const hhmm = (total: number) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

export function Calendar() {
  const { t } = useT();
  const { user, loading } = useAuth();
  if (loading) return <p className="xp-loading">{t("loading")}</p>;
  if (!user) return <SignedOut />;
  return <CalendarBody userId={user.id} />;
}

function SignedOut() {
  const { t } = useT();
  return (
    <div className="cal2-gate">
      <b>{t("calSignInTitle")}</b>
      <p>{t("calSignInBlurb")}</p>
      <Link to="/auth" className="btn-base btn-primary">
        {t("signIn")}
      </Link>
    </div>
  );
}

function CalendarBody({ userId }: { userId: string }) {
  const { lang, t } = useT();
  const { rows, missing, save, remove, reload } = useCalendar(userId);
  const today = new Date();
  const [sel, setSel] = useState(key(today));
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [draft, setDraft] = useState<Ev | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const e of rows) {
      const list = map.get(e.day) ?? [];
      list.push(e);
      map.set(e.day, list);
    }
    for (const list of map.values()) list.sort((a, b) => mins(a.at) - mins(b.at));
    return map;
  }, [rows]);

  // Six weeks from the Sunday on or before the 1st: a fixed grid never reflows
  // when the month changes, which is what makes clicking through months calm.
  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [view]);

  const dow = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(lang, { weekday: "short" }),
      ),
    [lang],
  );

  const shift = (n: number) => {
    setView(new Date(view.getFullYear(), view.getMonth() + n, 1));
    playSound("nav");
  };

  const agenda = byDay.get(sel) ?? [];
  const selDate = parse(sel);

  // A row with no server id yet. useCalendar reads the prefix to decide
  // between an insert and an update.
  const blank = (): Ev => ({
    id: `new-${Date.now()}`,
    day: sel,
    at: "09:00",
    mins: 60,
    title: "",
    note: null,
    tone: 0,
  });

  if (missing) {
    return (
      <div className="cal2-gate">
        <b>{t("calNotSetUpTitle")}</b>
        <p>{t("calNotSetUpBlurb")}</p>
        <button className="btn-base btn-primary" onClick={() => void reload()}>
          {t("tryAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="cal2">
      <div className="cal2-month">
        <div className="cal2-head">
          <button onClick={() => shift(-1)} aria-label={t("previousMonth")}>
            ◄
          </button>
          <button
            className="cal2-title"
            onClick={() => {
              setView(new Date(today.getFullYear(), today.getMonth(), 1));
              setSel(key(today));
            }}
            title={t("today")}
          >
            {view.toLocaleDateString(lang, { month: "long", year: "numeric" })}
          </button>
          <button onClick={() => shift(1)} aria-label={t("nextMonth")}>
            ►
          </button>
        </div>
        <div className="cal2-grid">
          {dow.map((d, i) => (
            <span key={i} className="cal2-dow">
              {d}
            </span>
          ))}
          {cells.map((d) => {
            const k = key(d);
            const list = byDay.get(k) ?? [];
            return (
              <button
                key={k}
                className={`cal2-cell ${d.getMonth() === view.getMonth() ? "" : "is-out"} ${
                  k === sel ? "is-on" : ""
                } ${k === key(today) ? "is-today" : ""}`}
                onClick={() => setSel(k)}
              >
                <span className="cal2-num">{d.getDate()}</span>
                <span className="cal2-dots">
                  {list.slice(0, 4).map((e) => (
                    <i key={e.id} style={{ background: TONES[e.tone] ?? TONES[0] }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cal2-agenda">
        <div className="cal2-agenda-head">
          <b>
            {selDate.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "short" })}
          </b>
          <button
            className="cal2-add"
            onClick={() => {
              setDraft(blank());
              playSound("click");
            }}
          >
            + {t("calEvent")}
          </button>
        </div>

        {draft && (
          <form
            className="cal2-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.title.trim()) return;
              save(draft);
              setDraft(null);
              playSound("click");
            }}
          >
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={t("calTitle")}
              maxLength={80}
            />
            <div className="cal2-form-row">
              <input
                type="time"
                value={draft.at}
                onChange={(e) => setDraft({ ...draft, at: e.target.value })}
                aria-label={t("calStarts")}
              />
              <select
                value={draft.mins}
                onChange={(e) => setDraft({ ...draft, mins: +e.target.value })}
                aria-label={t("calLength")}
              >
                {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                  <option key={m} value={m}>
                    {m} {t("min")}
                  </option>
                ))}
              </select>
              <span className="cal2-tones">
                {TONES.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    className={draft.tone === i ? "is-on" : ""}
                    style={{ background: c }}
                    onClick={() => setDraft({ ...draft, tone: i })}
                    aria-label={`${t("colour")} ${i + 1}`}
                  />
                ))}
              </span>
            </div>
            <textarea
              rows={2}
              value={draft.note ?? ""}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder={t("calNote")}
            />
            <div className="cal2-form-btns">
              <button
                type="button"
                className="btn-base btn-tertiary"
                onClick={() => setDraft(null)}
              >
                {t("cancel")}
              </button>
              <button className="btn-base btn-primary" disabled={!draft.title.trim()}>
                {t("save")}
              </button>
            </div>
          </form>
        )}

        <ul className="cal2-list">
          {agenda.map((e) => (
            <li key={e.id} style={{ borderLeftColor: TONES[e.tone] ?? TONES[0] }}>
              <button className="cal2-ev" onClick={() => setDraft(e)}>
                <span className="cal2-when">
                  {e.at} → {hhmm(mins(e.at) + e.mins)}
                </span>
                <span className="cal2-what">{e.title}</span>
                {e.note && <span className="cal2-note">{e.note}</span>}
              </button>
              <button
                className="cal2-del"
                onClick={() => remove(e.id)}
                aria-label={t("delete")}
                title={t("delete")}
              >
                ✕
              </button>
            </li>
          ))}
          {agenda.length === 0 && !draft && <li className="cal2-empty">{t("calNothing")}</li>}
        </ul>
      </div>
    </div>
  );
}
