import { useEffect, useMemo, useRef, useState } from "react";
import { useT, type StringKey } from "@/lib/i18n";
import { XPIcon } from "@/components/XPIcon";
import { Markdown } from "@/lib/markdown";
import { playSound } from "@/lib/sound";
import { topics } from "@/lib/syllabus";
import {
  attempts,
  blankMistake,
  blankQuestion,
  blankSet,
  byCause,
  CAUSES,
  logAttempt,
  matches,
  mistakes,
  questions,
  questionsIn,
  removeMistake,
  removeQuestion,
  removeSet,
  saveMistake,
  saveQuestion,
  saveSet,
  sets,
  shuffled,
  type Cause,
  type Kind,
  type Mistake,
  type Question,
  type QuestionSet,
} from "@/lib/practice";

/**
 * Practice: questions to sit, and the mistakes that came out of sitting them.
 *
 * The point of the mistake log is not the list. It is the reason field: four
 * slips and four concept gaps are the same four marks and completely different
 * problems, and until you write the reason down you cannot tell which you have.
 * So the reason is required and the correction is the field with the room.
 */
type Tab = "sets" | "sit" | "mistakes";

const CAUSE_KEY: Record<Cause, StringKey> = {
  concept: "pcConcept",
  method: "pcMethod",
  slip: "pcSlip",
  misread: "pcMisread",
  time: "pcTime",
};

const KIND_KEY: Record<Kind, StringKey> = {
  choice: "pcChoice",
  short: "pcShort",
  open: "pcOpen",
};

export function Practice() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("sets");
  const [sitting, setSitting] = useState<string | null>(null);

  return (
    <div className="pc">
      <div className="pc-tabs" role="tablist">
        {(
          [
            ["sets", "pcSets"],
            ["sit", "pcSit"],
            ["mistakes", "pcMistakes"],
          ] as [Tab, StringKey][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-on" : ""}
            onClick={() => setTab(id)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <div className="pc-body">
        {tab === "sets" && (
          <Sets
            onSit={(id) => {
              setSitting(id);
              setTab("sit");
            }}
          />
        )}
        {tab === "sit" && (
          <Sit setId={sitting} onPick={setSitting} onDone={() => setTab("mistakes")} />
        )}
        {tab === "mistakes" && <Mistakes />}
      </div>
    </div>
  );
}

/* ---- sets and their questions ------------------------------------------ */

function Sets({ onSit }: { onSit: (setId: string) => void }) {
  const { t } = useT();
  const list = sets.use();
  const qs = questions.use();
  const tries = attempts.use();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);
  const [naming, setNaming] = useState<QuestionSet | null>(null);

  return (
    <div className="pc-pane">
      <div className="pc-head">
        <h4>{t("pcSets")}</h4>
        <button className="btn-base btn-primary" onClick={() => setNaming(blankSet())}>
          {t("pcNewSet")}
        </button>
      </div>

      {naming && (
        <form
          className="pc-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (naming.name.trim()) {
              saveSet({ ...naming, name: naming.name.trim() });
              setOpen(naming.id);
            }
            setNaming(null);
          }}
        >
          <label>
            <span>{t("name")}</span>
            <input
              autoFocus
              value={naming.name}
              onChange={(e) => setNaming({ ...naming, name: e.target.value })}
              required
            />
          </label>
          <label>
            <span>{t("pcMinutes")}</span>
            <input
              type="number"
              min={0}
              max={600}
              value={naming.minutes}
              onChange={(e) => setNaming({ ...naming, minutes: Number(e.target.value) || 0 })}
            />
          </label>
          <div className="pc-formacts">
            <button type="submit" className="btn-base btn-primary">
              {t("create")}
            </button>
            <button
              type="button"
              className="btn-base btn-secondary"
              onClick={() => setNaming(null)}
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

      {list.length === 0 && !naming ? (
        <Empty title={t("pcNoSetsTitle")} body={t("pcNoSetsBody")} />
      ) : (
        <ul className="pc-sets">
          {list.map((s) => {
            const mine = questionsIn(qs, s.id);
            const last = tries.filter((a) => a.setId === s.id).at(-1);
            return (
              <li key={s.id}>
                <div className="pc-setrow">
                  <button
                    className="pc-setname"
                    onClick={() => setOpen(open === s.id ? null : s.id)}
                    aria-expanded={open === s.id}
                  >
                    {open === s.id ? "▾" : "▸"} <b>{s.name}</b>
                    <i>
                      {mine.length} {t("pcQuestions")}
                      {s.minutes ? ` · ${s.minutes}m` : ""}
                      {last ? ` · ${t("pcLast")} ${last.right}/${last.total}` : ""}
                    </i>
                  </button>
                  <span className="pc-setacts">
                    <button
                      className="btn-base btn-secondary"
                      disabled={!mine.length}
                      onClick={() => onSit(s.id)}
                    >
                      {t("pcStart")}
                    </button>
                    <button onClick={() => setEditing(blankQuestion(s.id))} aria-label={t("add")}>
                      +
                    </button>
                    <button onClick={() => removeSet(s.id)} aria-label={t("delete")}>
                      &times;
                    </button>
                  </span>
                </div>

                {open === s.id && (
                  <ul className="pc-qs">
                    {mine.map((q) => (
                      <li key={q.id}>
                        <span className="pc-kind">{t(KIND_KEY[q.kind])}</span>
                        <b>{q.prompt || t("pcBlankQuestion")}</b>
                        <span className="pc-qacts">
                          <button onClick={() => setEditing(q)} aria-label={t("edit")}>
                            {"✎"}
                          </button>
                          <button onClick={() => removeQuestion(q.id)} aria-label={t("delete")}>
                            &times;
                          </button>
                        </span>
                      </li>
                    ))}
                    {!mine.length && <li className="pc-quiet">{t("pcNoQuestions")}</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <QuestionForm
          value={editing}
          onCancel={() => setEditing(null)}
          onSave={(q) => {
            saveQuestion(q);
            setOpen(q.setId);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function QuestionForm({
  value,
  onSave,
  onCancel,
}: {
  value: Question;
  onSave: (q: Question) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const tree = topics.use();
  const [q, setQ] = useState(value);
  const set = <K extends keyof Question>(k: K, v: Question[K]) => setQ((p) => ({ ...p, [k]: v }));

  const options = q.options.length ? q.options : ["", ""];

  return (
    <div className="pc-scrim modal-scrim" onClick={onCancel}>
      <form
        className="pc-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!q.prompt.trim()) return;
          const cleaned =
            q.kind === "choice" ? options.map((o) => o.trim()).filter(Boolean) : q.options;
          if (q.kind === "choice" && cleaned.length < 2) return;
          onSave({ ...q, prompt: q.prompt.trim(), options: cleaned, answer: q.answer.trim() });
        }}
      >
        <h4>{t("pcQuestion")}</h4>

        <div className="pc-kinds" role="group">
          {(["short", "choice", "open"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={q.kind === k ? "is-on" : ""}
              onClick={() => set("kind", k)}
            >
              {t(KIND_KEY[k])}
            </button>
          ))}
        </div>

        <label className="pc-wide">
          <span>{t("pcPrompt")}</span>
          <textarea
            autoFocus
            rows={3}
            value={q.prompt}
            onChange={(e) => set("prompt", e.target.value)}
            required
          />
        </label>

        {q.kind === "choice" ? (
          <div className="pc-wide">
            <span className="pc-lab">{t("pcOptions")}</span>
            <p className="pc-quiet">{t("pcFirstIsRight")}</p>
            {options.map((o, i) => (
              <input
                key={i}
                className={i === 0 ? "is-right" : ""}
                value={o}
                placeholder={i === 0 ? t("pcRightAnswer") : `${t("pcWrongAnswer")} ${i}`}
                onChange={(e) =>
                  set(
                    "options",
                    options.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              />
            ))}
            <button
              type="button"
              className="btn-base btn-secondary"
              onClick={() => set("options", [...options, ""])}
            >
              {t("pcAddOption")}
            </button>
          </div>
        ) : (
          <label className="pc-wide">
            <span>{q.kind === "open" ? t("pcModelAnswer") : t("pcAnswer")}</span>
            <textarea
              rows={q.kind === "open" ? 4 : 2}
              value={q.answer}
              onChange={(e) => set("answer", e.target.value)}
            />
          </label>
        )}

        <label className="pc-wide">
          <span>{t("pcWorking")}</span>
          <textarea rows={2} value={q.note} onChange={(e) => set("note", e.target.value)} />
        </label>

        {tree.length > 0 && (
          <label>
            <span>{t("pcTopic")}</span>
            <select
              value={q.topicId ?? ""}
              onChange={(e) => set("topicId", e.target.value || null)}
            >
              <option value="">{t("none")}</option>
              {tree.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="pc-formacts">
          <button type="submit" className="btn-base btn-primary">
            {t("save")}
          </button>
          <button type="button" className="btn-base btn-secondary" onClick={onCancel}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---- sitting a set ------------------------------------------------------ */

type Answer = { given: string; right: boolean | null };

function Sit({
  setId,
  onPick,
  onDone,
}: {
  setId: string | null;
  onPick: (id: string) => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const allSets = sets.use();
  const allQs = questions.use();
  const paper = allSets.find((s) => s.id === setId);
  const qs = useMemo(() => (setId ? questionsIn(allQs, setId) : []), [allQs, setId]);

  const [at, setAt] = useState(0);
  const [given, setGiven] = useState<Record<string, Answer>>({});
  const [shown, setShown] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [left, setLeft] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const logged = useRef(false);

  // One seed for the whole sitting, so options do not reshuffle under the
  // pointer every time the component re-renders.
  const seed = useMemo(() => startedAt, [startedAt]);

  const finish = useMemo(
    () => () => {
      if (logged.current || !setId) return;
      logged.current = true;
      const right = Object.values(given).filter((a) => a.right).length;
      logAttempt({
        setId,
        at: Date.now(),
        seconds: Math.round((Date.now() - startedAt) / 1000),
        right,
        total: qs.length,
      });
      setOver(true);
    },
    [given, qs.length, setId, startedAt],
  );

  useEffect(() => {
    if (!paper?.minutes || over) return;
    const end = startedAt + paper.minutes * 60_000;
    const tick = () => {
      const ms = end - Date.now();
      setLeft(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) finish();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [paper?.minutes, startedAt, over, finish]);

  if (!setId || !paper)
    return (
      <div className="pc-pane">
        <Empty title={t("pcPickSetTitle")} body={t("pcPickSetBody")} />
        <ul className="pc-picklist">
          {allSets
            .filter((s) => questionsIn(allQs, s.id).length)
            .map((s) => (
              <li key={s.id}>
                <button className="btn-base btn-secondary" onClick={() => onPick(s.id)}>
                  {s.name}
                </button>
              </li>
            ))}
        </ul>
      </div>
    );

  if (over) {
    const right = Object.values(given).filter((a) => a.right).length;
    const wrong = qs.filter((q) => given[q.id] && given[q.id].right === false);
    return (
      <div className="pc-pane">
        <div className="pc-score">
          <b>
            {right} / {qs.length}
          </b>
          <i>{Math.round((right / Math.max(1, qs.length)) * 100)}%</i>
        </div>
        {wrong.length > 0 && (
          <>
            <p className="pc-lead">{t("pcLogThese")}</p>
            <ul className="pc-wrong">
              {wrong.map((q) => (
                <li key={q.id}>
                  <b>{q.prompt}</b>
                  <button
                    className="btn-base btn-secondary"
                    onClick={() => {
                      saveMistake({
                        ...blankMistake(),
                        prompt: q.prompt,
                        gave: given[q.id]?.given ?? "",
                        correct: q.kind === "choice" ? q.options[0] : q.answer,
                        topicId: q.topicId,
                      });
                      playSound("ding");
                      onDone();
                    }}
                  >
                    {t("pcLogMistake")}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <button
          className="btn-base btn-primary"
          onClick={() => {
            logged.current = false;
            setGiven({});
            setAt(0);
            setShown(false);
            setOver(false);
            setStartedAt(Date.now());
          }}
        >
          {t("pcAgain")}
        </button>
      </div>
    );
  }

  const q = qs[at];
  if (!q) return <Empty title={t("pcNoQuestions")} body={t("pcNoSetsBody")} />;
  const answer = given[q.id];
  const opts = q.kind === "choice" ? shuffled(q.options, seed + at) : [];

  const record = (value: string, right: boolean | null) => {
    setGiven((p) => ({ ...p, [q.id]: { given: value, right } }));
    setShown(true);
  };

  return (
    <div className="pc-pane pc-sit">
      <div className="pc-sithead">
        <span>
          {at + 1} / {qs.length}
        </span>
        <b>{paper.name}</b>
        {left !== null && (
          <span className={`pc-clock ${left < 60 ? "is-low" : ""}`}>
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      <div className="pc-prompt">
        <Markdown text={q.prompt} />
      </div>

      {q.kind === "choice" && (
        <ul className="pc-opts">
          {opts.map((o) => {
            const chosen = answer?.given === o;
            const isRight = o === q.options[0];
            return (
              <li key={o}>
                <button
                  className={shown ? (isRight ? "is-right" : chosen ? "is-wrong" : "") : ""}
                  disabled={shown}
                  onClick={() => record(o, isRight)}
                >
                  {o}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {q.kind === "short" && (
        <form
          className="pc-short"
          onSubmit={(e) => {
            e.preventDefault();
            const value = (new FormData(e.currentTarget).get("a") as string) ?? "";
            record(value, matches(value, q.answer));
          }}
        >
          <input name="a" autoFocus disabled={shown} defaultValue={answer?.given ?? ""} />
          {!shown && (
            <button type="submit" className="btn-base btn-primary">
              {t("pcCheck")}
            </button>
          )}
        </form>
      )}

      {q.kind === "open" && !shown && (
        <div className="pc-open">
          <textarea rows={5} id="pc-open-a" defaultValue={answer?.given ?? ""} />
          <button
            className="btn-base btn-primary"
            onClick={() =>
              record(
                (document.getElementById("pc-open-a") as HTMLTextAreaElement)?.value ?? "",
                null,
              )
            }
          >
            {t("pcReveal")}
          </button>
        </div>
      )}

      {shown && (
        <div className="pc-after">
          {q.kind !== "choice" && (
            <p className={answer?.right === false ? "pc-bad" : answer?.right ? "pc-good" : ""}>
              <b>{t("pcAnswer")}:</b> {q.answer}
            </p>
          )}
          {q.note && (
            <div className="pc-working">
              <Markdown text={q.note} />
            </div>
          )}
          {/* Open answers cannot be marked by a machine, so you mark them. A
              guess at whether your wording of an explanation is right would be
              wrong often enough to be worth less than nothing. */}
          {q.kind === "open" && answer?.right === null && (
            <div className="pc-selfmark">
              <span>{t("pcSelfMark")}</span>
              <button
                className="btn-base btn-secondary"
                onClick={() => setGiven((p) => ({ ...p, [q.id]: { ...p[q.id], right: true } }))}
              >
                {t("pcGotIt")}
              </button>
              <button
                className="btn-base btn-secondary"
                onClick={() => setGiven((p) => ({ ...p, [q.id]: { ...p[q.id], right: false } }))}
              >
                {t("pcMissedIt")}
              </button>
            </div>
          )}
          <button
            className="btn-base btn-primary"
            onClick={() => {
              if (at + 1 >= qs.length) finish();
              else {
                setAt(at + 1);
                setShown(false);
              }
            }}
          >
            {at + 1 >= qs.length ? t("pcFinish") : t("pcNext")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- the mistake notebook ---------------------------------------------- */

function Mistakes() {
  const { t } = useT();
  const list = mistakes.use();
  const tree = topics.use();
  const [editing, setEditing] = useState<Mistake | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const counts = useMemo(() => byCause(list), [list]);
  const openOnes = list.filter((m) => !m.resolved);
  const rows = [...(showResolved ? list : openOnes)].sort((a, b) => b.at - a.at);
  const worst = CAUSES.reduce((a, b) => (counts[b] > counts[a] ? b : a), CAUSES[0]);

  return (
    <div className="pc-pane">
      <div className="pc-head">
        <h4>{t("pcMistakes")}</h4>
        <button className="btn-base btn-primary" onClick={() => setEditing(blankMistake())}>
          {t("pcAddMistake")}
        </button>
      </div>

      {openOnes.length > 0 && (
        <>
          <ul className="pc-causes">
            {CAUSES.map((c) => (
              <li key={c} className={`is-${c} ${c === worst && counts[c] > 0 ? "is-worst" : ""}`}>
                <b>{counts[c]}</b>
                <i>{t(CAUSE_KEY[c])}</i>
              </li>
            ))}
          </ul>
          {counts[worst] > 1 && (
            <p className="pc-lead">
              {t("pcMostOften")} <b>{t(CAUSE_KEY[worst])}</b>
            </p>
          )}
        </>
      )}

      {editing && (
        <MistakeForm
          value={editing}
          topics={tree.map((x) => ({ id: x.id, name: x.name }))}
          onCancel={() => setEditing(null)}
          onSave={(m) => {
            saveMistake(m);
            setEditing(null);
          }}
        />
      )}

      {rows.length === 0 && !editing ? (
        <Empty title={t("pcNoMistakesTitle")} body={t("pcNoMistakesBody")} />
      ) : (
        <ul className="pc-mistakes">
          {rows.map((m) => (
            <li key={m.id} className={m.resolved ? "is-resolved" : ""}>
              <div className="pc-mhead">
                <span className={`pc-cause is-${m.cause}`}>{t(CAUSE_KEY[m.cause])}</span>
                <b>{m.prompt || t("pcBlankQuestion")}</b>
                <span className="pc-macts">
                  <button
                    onClick={() => saveMistake({ ...m, resolved: !m.resolved })}
                    aria-label={m.resolved ? t("pcReopen") : t("pcResolve")}
                    title={m.resolved ? t("pcReopen") : t("pcResolve")}
                  >
                    {m.resolved ? "↺" : "✓"}
                  </button>
                  <button onClick={() => setEditing(m)} aria-label={t("edit")}>
                    {"✎"}
                  </button>
                  <button onClick={() => removeMistake(m.id)} aria-label={t("delete")}>
                    &times;
                  </button>
                </span>
              </div>
              <div className="pc-mbody">
                {m.gave && (
                  <p>
                    <i>{t("pcIPut")}</i> <s>{m.gave}</s>
                  </p>
                )}
                {m.correct && (
                  <p>
                    <i>{t("pcShouldBe")}</i> <b>{m.correct}</b>
                  </p>
                )}
                {m.fix && <p className="pc-fix">{m.fix}</p>}
                {m.topicId && (
                  <p className="pc-quiet">{tree.find((x) => x.id === m.topicId)?.name}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.some((m) => m.resolved) && (
        <button className="btn-base btn-secondary" onClick={() => setShowResolved((v) => !v)}>
          {showResolved ? t("pcHideResolved") : t("pcShowResolved")}
        </button>
      )}
    </div>
  );
}

function MistakeForm({
  value,
  topics: list,
  onSave,
  onCancel,
}: {
  value: Mistake;
  topics: { id: string; name: string }[];
  onSave: (m: Mistake) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [m, setM] = useState(value);
  const set = <K extends keyof Mistake>(k: K, v: Mistake[K]) => setM((p) => ({ ...p, [k]: v }));

  return (
    <div className="pc-scrim modal-scrim" onClick={onCancel}>
      <form
        className="pc-modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (m.prompt.trim()) onSave({ ...m, prompt: m.prompt.trim() });
        }}
      >
        <h4>{t("pcMistake")}</h4>
        <label className="pc-wide">
          <span>{t("pcWhatWasAsked")}</span>
          <textarea
            autoFocus
            rows={2}
            value={m.prompt}
            onChange={(e) => set("prompt", e.target.value)}
            required
          />
        </label>
        <label>
          <span>{t("pcIPut")}</span>
          <input value={m.gave} onChange={(e) => set("gave", e.target.value)} />
        </label>
        <label>
          <span>{t("pcShouldBe")}</span>
          <input value={m.correct} onChange={(e) => set("correct", e.target.value)} />
        </label>

        <div className="pc-wide">
          <span className="pc-lab">{t("pcWhy")}</span>
          <div className="pc-kinds" role="group">
            {CAUSES.map((c) => (
              <button
                key={c}
                type="button"
                className={m.cause === c ? "is-on" : ""}
                onClick={() => set("cause", c)}
              >
                {t(CAUSE_KEY[c])}
              </button>
            ))}
          </div>
        </div>

        {/* The field that does the work. Everything above is the record; this
            is the bit you read back. */}
        <label className="pc-wide">
          <span>{t("pcWhatIKnowNow")}</span>
          <textarea rows={4} value={m.fix} onChange={(e) => set("fix", e.target.value)} />
        </label>

        {list.length > 0 && (
          <label>
            <span>{t("pcTopic")}</span>
            <select
              value={m.topicId ?? ""}
              onChange={(e) => set("topicId", e.target.value || null)}
            >
              <option value="">{t("none")}</option>
              {list.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="pc-formacts">
          <button type="submit" className="btn-base btn-primary">
            {t("save")}
          </button>
          <button type="button" className="btn-base btn-secondary" onClick={onCancel}>
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="pc-empty">
      <XPIcon name="help" size={32} />
      <p>{title}</p>
      <p className="pc-quiet">{body}</p>
    </div>
  );
}
