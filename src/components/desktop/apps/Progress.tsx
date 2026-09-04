import { useMemo, useState } from "react";
import { useT, type StringKey } from "@/lib/i18n";
import { XPIcon } from "@/components/XPIcon";
import { allCards, decks, retention, reviewDays, reviewStreak, reviews, sched } from "@/lib/cards";
import { progress, topics, type Topic } from "@/lib/syllabus";
import {
  blank,
  daysUntil,
  exams,
  hoursUntil,
  ordered,
  removeExam,
  saveExam,
  urgency,
  type Exam,
} from "@/lib/exams";

/**
 * What the numbers say, from what this browser actually holds.
 *
 * The desktop app draws its year of squares from the focus timer, which
 * records every finished block to disk. Here the sessions live on the server
 * and belong to your account, so the grid is drawn from card reviews instead:
 * a narrower question, "did you revise", but one this page can answer offline
 * and without asking anybody to be signed in.
 */

type Tab = "activity" | "retention" | "exams";

const TABS: { id: Tab; label: StringKey }[] = [
  { id: "activity", label: "prActivity" },
  { id: "retention", label: "prRetention" },
  { id: "exams", label: "prExams" },
];

export function Progress() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("activity");

  return (
    <div className="pr">
      <div className="pr-tabs" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            className={tab === x.id ? "is-on" : ""}
            onClick={() => setTab(x.id)}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      <div className="pr-body">
        {tab === "activity" && <Activity />}
        {tab === "retention" && <Retention />}
        {tab === "exams" && <Exams />}
      </div>
    </div>
  );
}

/* ---- activity: the year, as squares ------------------------------------ */

/** Five steps rather than a continuous scale, because the eye cannot read a
 *  gradient but can count five shades, and a step tells you a real thing:
 *  nothing, a couple, an ordinary sitting, a good one, a long one. */
const STEPS = [0, 5, 20, 50, 100];

function Activity() {
  const { t } = useT();
  const log = reviews.use();
  const days = useMemo(() => reviewDays(log, 371), [log]);
  const [hover, setHover] = useState<{ day: string; count: number } | null>(null);

  const total = days.reduce((n, d) => n + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;
  const best = days.reduce((m, d) => Math.max(m, d.count), 0);

  // Columns are weeks. The first column is padded so every row is one weekday
  // all the way across, which is the only thing that makes the grid readable.
  const lead = days.length ? days[0].date.getDay() : 0;
  const cells = [...Array.from({ length: lead }, () => null), ...days];
  const weeks: ((typeof days)[number] | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const level = (n: number) => STEPS.filter((s) => n > s).length;

  return (
    <div className="pr-pane">
      <div className="pr-stats">
        <Stat label={t("prAnswered")} value={String(total)} />
        <Stat label={t("prActiveDays")} value={String(active)} />
        <Stat label={t("prBestDay")} value={String(best)} />
        <Stat label={t("streak")} value={String(reviewStreak(log))} />
      </div>

      <div className="pr-heat-wrap">
        <div className="pr-heat" role="img" aria-label={t("prHeatAlt")}>
          {weeks.map((week, wi) => (
            <div className="pr-week" key={wi}>
              {Array.from({ length: 7 }, (_, di) => {
                const d = week[di];
                if (!d) return <span key={di} className="pr-cell is-pad" />;
                return (
                  <span
                    key={di}
                    className={`pr-cell lv${level(d.count)}`}
                    title={`${d.day}: ${d.count}`}
                    onPointerEnter={() => setHover({ day: d.day, count: d.count })}
                    onPointerLeave={() => setHover(null)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="pr-legend">
        <span>{hover ? `${hover.day} · ${hover.count}` : t("prYear")}</span>
        <span className="pr-scale">
          {t("prLess")}
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`pr-cell lv${l}`} />
          ))}
          {t("prMore")}
        </span>
      </p>

      <Course />
    </div>
  );
}

/** How far through the course, by subject. The syllabus already knows this;
 *  putting it beside the grid is what turns "I revised a lot" into "I revised
 *  a lot of the same chapter". */
function Course() {
  const { t } = useT();
  const tree = topics.use();
  const subjects = tree.filter((x: Topic) => x.parentId === null);
  if (!subjects.length) return null;

  return (
    <section>
      <h4>{t("prByTopic")}</h4>
      <ul className="pr-split">
        {subjects.map((s) => {
          const pct = Math.round(progress(tree, s.id) * 100);
          return (
            <li key={s.id}>
              <span className="pr-swatch" style={{ background: "var(--flame)" }} />
              <b>{s.name}</b>
              <i>{pct}%</i>
              <span className="pr-track">
                <span style={{ width: `${pct}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---- retention: is any of it sticking ---------------------------------- */

function Retention() {
  const { t } = useT();
  const log = reviews.use();
  const table = sched.use();
  const cards = allCards(decks.use());

  const bands = useMemo(() => retention(log), [log]);
  const answered = log.length;

  if (answered < 10)
    return (
      <Empty icon="help" title={t("prThinTitle")} body={`${t("prThinBody")} ${answered}/10`} />
    );

  const label = (from: number, upTo: number) =>
    upTo === Infinity ? `${from}d+` : from === 0 ? `≤${upTo}d` : `${from}–${upTo}d`;

  const overall = Math.round((log.filter((r) => r.grade > 1).length / answered) * 100);
  const mature = cards.filter((c) => (table[c.id]?.interval ?? 0) >= 21).length;

  return (
    <div className="pr-pane">
      <div className="pr-stats">
        <Stat label={t("prRecall")} value={`${overall}%`} />
        <Stat label={t("prAnswered")} value={String(answered)} />
        <Stat label={t("prMature")} value={String(mature)} />
      </div>

      <p className="pr-lead">{t("prCurveLead")}</p>
      <div className="pr-curve">
        {bands.map((b) => {
          const pct = b.total ? Math.round((b.kept / b.total) * 100) : 0;
          return (
            <div className="pr-band" key={String(b.upTo)}>
              <span
                className={`pr-cbar ${b.total ? "" : "is-empty"}`}
                style={{ height: `${b.total ? Math.max(3, pct) : 2}%` }}
                title={`${b.kept}/${b.total}`}
              />
              <b>{b.total ? `${pct}%` : "—"}</b>
              <i>{label(b.from, b.upTo)}</i>
            </div>
          );
        })}
      </div>
      <p className="pr-quiet">{t("prCurveNote")}</p>
    </div>
  );
}

/* ---- exams: how long have you got -------------------------------------- */

function Exams() {
  const { t } = useT();
  const list = exams.use();
  const tree = topics.use();
  const [editing, setEditing] = useState<Exam | null>(null);

  const rows = useMemo(() => ordered(list), [list]);
  const subjects = tree.filter((x) => x.parentId === null);

  return (
    <div className="pr-pane">
      <div className="pr-exhead">
        <h4>{t("prExams")}</h4>
        <button className="btn-base btn-primary" onClick={() => setEditing(blank())}>
          {t("prAddExam")}
        </button>
      </div>

      {editing && (
        <ExamForm
          value={editing}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
          onCancel={() => setEditing(null)}
          onSave={(e) => {
            saveExam(e);
            setEditing(null);
          }}
        />
      )}

      {rows.length === 0 && !editing ? (
        <Empty icon="calendar" title={t("prNoExamsTitle")} body={t("prNoExamsBody")} />
      ) : (
        <ul className="pr-exams">
          {rows.map((e) => {
            const d = daysUntil(e);
            const u = urgency(d);
            return (
              <li key={e.id} className={`pr-exam is-${u}`}>
                <span className="pr-count">
                  {u === "past" ? (
                    <b>{t("prSat")}</b>
                  ) : d === 0 ? (
                    <>
                      <b>{hoursUntil(e)}</b>
                      <i>{t("prHoursLeft")}</i>
                    </>
                  ) : (
                    <>
                      <b>{d}</b>
                      <i>{d === 1 ? t("prDay") : t("prDays")}</i>
                    </>
                  )}
                </span>
                <span className="pr-exbody">
                  <b>{e.name || t("prUntitledExam")}</b>
                  <i>
                    {e.day}
                    {e.at ? ` · ${e.at}` : ""}
                    {e.subjectId
                      ? ` · ${subjects.find((s) => s.id === e.subjectId)?.name ?? ""}`
                      : ""}
                  </i>
                  {e.note && <span className="pr-quiet">{e.note}</span>}
                </span>
                <span className="pr-exacts">
                  <button onClick={() => setEditing(e)} aria-label={t("edit")}>
                    {"✎"}
                  </button>
                  <button onClick={() => removeExam(e.id)} aria-label={t("delete")}>
                    &times;
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExamForm({
  value,
  subjects,
  onSave,
  onCancel,
}: {
  value: Exam;
  subjects: { id: string; name: string }[];
  onSave: (e: Exam) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(value);
  const set = <K extends keyof Exam>(k: K, v: Exam[K]) => setDraft((p) => ({ ...p, [k]: v }));

  return (
    <form
      className="pr-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.name.trim() && draft.day) onSave({ ...draft, name: draft.name.trim() });
      }}
    >
      <label>
        <span>{t("name")}</span>
        <input
          autoFocus
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          required
        />
      </label>
      <label>
        <span>{t("prWhen")}</span>
        <input
          type="date"
          value={draft.day}
          onChange={(e) => set("day", e.target.value)}
          required
        />
      </label>
      <label>
        <span>{t("prTime")}</span>
        <input type="time" value={draft.at} onChange={(e) => set("at", e.target.value)} />
      </label>
      {subjects.length > 0 && (
        <label>
          <span>{t("prSubject")}</span>
          <select
            value={draft.subjectId ?? ""}
            onChange={(e) => set("subjectId", e.target.value || null)}
          >
            <option value="">{t("none")}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="pr-wide">
        <span>{t("prNote")}</span>
        <input value={draft.note} onChange={(e) => set("note", e.target.value)} />
      </label>
      <div className="pr-formacts">
        <button type="submit" className="btn-base btn-primary">
          {t("save")}
        </button>
        <button type="button" className="btn-base btn-secondary" onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/* ---- small shared pieces ----------------------------------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="pr-stat">
      <b>{value}</b>
      <i>{label}</i>
    </div>
  );
}

function Empty({
  icon,
  title,
  body,
}: {
  icon: "clock" | "help" | "calendar";
  title: string;
  body: string;
}) {
  return (
    <div className="pr-empty">
      <XPIcon name={icon} size={32} />
      <p>{title}</p>
      <p className="pr-quiet">{body}</p>
    </div>
  );
}
