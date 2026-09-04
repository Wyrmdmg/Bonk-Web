import { useMemo, useState } from "react";
import { useT, type StringKey } from "@/lib/i18n";
import { XPIcon } from "@/components/XPIcon";
import {
  add,
  childrenOf,
  derive,
  nextStatus,
  progress,
  remove,
  rename,
  setStatus,
  STATUSES,
  subjects,
  tally,
  topics,
  type Status,
  type Topic,
} from "@/lib/syllabus";

/**
 * The syllabus.
 *
 * A course is a list of things to learn and a question about how far through
 * it you are, and until now the app could not hold either. The timer knew how
 * long you had studied and the flashcards knew which cards were due, but
 * nothing knew what the whole of it was, so nothing could say how much of it
 * was left.
 *
 * Depth is not fixed. Subject, unit, chapter, topic is what most courses look
 * like, but nothing here counts levels: a row can hold rows, all the way down.
 */
const STATUS_KEY: Record<Status, StringKey> = {
  todo: "sylTodo",
  learning: "sylLearning",
  revising: "sylRevising",
  mastered: "sylMastered",
};

export function Syllabus() {
  const { t } = useT();
  const list = topics.use();
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null | undefined>(undefined);
  const [filter, setFilter] = useState<Status | "all">("all");

  const roots = useMemo(() => subjects(list), [list]);
  const whole = useMemo(
    () => ({
      done: roots.length ? roots.reduce((n, r) => n + progress(list, r.id), 0) / roots.length : 0,
      counts: roots.reduce(
        (acc, r) => {
          const c = tally(list, r.id);
          for (const s of STATUSES) acc[s] += c[s];
          acc.total += c.total;
          return acc;
        },
        { todo: 0, learning: 0, revising: 0, mastered: 0, total: 0 },
      ),
    }),
    [list, roots],
  );

  const toggleOpen = (id: string) =>
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="syl">
      <header className="syl-head">
        <div>
          <h2>{t("appSyllabus")}</h2>
          <p>
            {whole.counts.total > 0
              ? `${whole.counts.mastered} / ${whole.counts.total} ${t("sylMastered").toLowerCase()}`
              : t("sylBlurb")}
          </p>
        </div>
        <button className="btn-base btn-primary" onClick={() => setAdding(null)}>
          {t("sylAddSubject")}
        </button>
      </header>

      {whole.counts.total > 0 && (
        <div className="syl-overall">
          <Bar value={whole.done} />
          <span>{Math.round(whole.done * 100)}%</span>
        </div>
      )}

      {/* Filtering hides rows that are finished, or shows only what has not
          been started, which is the question actually being asked the night
          before an exam. A branch stays if anything under it matches. */}
      <div className="syl-filter" role="group" aria-label={t("sylFilter")}>
        <button className={filter === "all" ? "is-on" : ""} onClick={() => setFilter("all")}>
          {t("sylAll")}
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`syl-chip is-${s} ${filter === s ? "is-on" : ""}`}
            onClick={() => setFilter(filter === s ? "all" : s)}
          >
            {t(STATUS_KEY[s])}
          </button>
        ))}
      </div>

      {adding === null && (
        <NewRow
          placeholder={t("sylSubjectName")}
          onDone={(name) => {
            if (name) setOpenIds((p) => [...p, add(null, name).id]);
            setAdding(undefined);
          }}
        />
      )}

      {roots.length === 0 && adding === undefined ? (
        <div className="syl-empty">
          <XPIcon name="folder-search" size={32} />
          <p>{t("sylEmptyTitle")}</p>
          <p className="syl-quiet">{t("sylEmptyBody")}</p>
        </div>
      ) : (
        <ul className="syl-tree">
          {roots.map((row) => (
            <Row
              key={row.id}
              row={row}
              list={list}
              depth={0}
              filter={filter}
              openIds={openIds}
              toggleOpen={toggleOpen}
              renaming={renaming}
              setRenaming={setRenaming}
              adding={adding}
              setAdding={setAdding}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  row,
  list,
  depth,
  filter,
  openIds,
  toggleOpen,
  renaming,
  setRenaming,
  adding,
  setAdding,
}: {
  row: Topic;
  list: Topic[];
  depth: number;
  filter: Status | "all";
  openIds: string[];
  toggleOpen: (id: string) => void;
  renaming: string | null;
  setRenaming: (id: string | null) => void;
  adding: string | null | undefined;
  setAdding: (id: string | null | undefined) => void;
}) {
  const { t } = useT();
  const kids = childrenOf(list, row.id);
  const open = openIds.includes(row.id);
  const done = progress(list, row.id);
  const counts = tally(list, row.id);
  // A branch is what is under it, so its label is read back out of the
  // progress. Its own stored status is still what the chip writes, because
  // setting a parent is how you set the whole branch at once.
  const shown = kids.length ? derive(done) : row.status;

  // A branch survives the filter if it matches or if anything under it does,
  // or filtering by "not started" would hide the subject holding all of them.
  const matches = filter === "all" || (kids.length ? counts[filter] > 0 : row.status === filter);
  if (!matches) return null;

  return (
    <li className="syl-row" style={{ "--depth": depth } as React.CSSProperties}>
      <div className="syl-line">
        <button
          className="syl-twist"
          aria-label={open ? t("collapse") : t("expand")}
          aria-expanded={kids.length ? open : undefined}
          disabled={!kids.length}
          onClick={() => toggleOpen(row.id)}
        >
          {kids.length ? (open ? "▾" : "▸") : "·"}
        </button>

        <button
          className={`syl-chip is-${shown}`}
          title={t("sylCycle")}
          onClick={() => setStatus(row.id, nextStatus(shown))}
        >
          {t(STATUS_KEY[shown])}
        </button>

        {renaming === row.id ? (
          <input
            autoFocus
            className="syl-input"
            defaultValue={row.name}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              if (e.currentTarget.value.trim()) rename(row.id, e.currentTarget.value);
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setRenaming(null);
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : (
          <button
            className="syl-name"
            onDoubleClick={() => setRenaming(row.id)}
            onClick={() => kids.length && toggleOpen(row.id)}
          >
            {row.name}
          </button>
        )}

        {kids.length > 0 && (
          <span className="syl-mini" title={`${counts.mastered} / ${counts.total}`}>
            <Bar value={done} />
          </span>
        )}

        <span className="syl-acts">
          <button
            onClick={() => setAdding(row.id)}
            aria-label={t("sylAddUnder")}
            title={t("sylAddUnder")}
          >
            +
          </button>
          <button onClick={() => setRenaming(row.id)} aria-label={t("rename")} title={t("rename")}>
            {"✎"}
          </button>
          <button onClick={() => remove(row.id)} aria-label={t("delete")} title={t("delete")}>
            &times;
          </button>
        </span>
      </div>

      {adding === row.id && (
        <NewRow
          depth={depth + 1}
          placeholder={t("sylTopicName")}
          onDone={(name) => {
            if (name) {
              add(row.id, name);
              if (!open) toggleOpen(row.id);
            }
            setAdding(undefined);
          }}
        />
      )}

      {open && kids.length > 0 && (
        <ul>
          {kids.map((kid) => (
            <Row
              key={kid.id}
              row={kid}
              list={list}
              depth={depth + 1}
              filter={filter}
              openIds={openIds}
              toggleOpen={toggleOpen}
              renaming={renaming}
              setRenaming={setRenaming}
              adding={adding}
              setAdding={setAdding}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Enter adds and stays open, so a chapter's topics go in one after another
 *  without reaching for the plus between each. Escape or an empty name ends it. */
function NewRow({
  depth = 0,
  placeholder,
  onDone,
}: {
  depth?: number;
  placeholder: string;
  onDone: (name: string) => void;
}) {
  return (
    <div className="syl-new" style={{ "--depth": depth } as React.CSSProperties}>
      <input
        autoFocus
        className="syl-input"
        placeholder={placeholder}
        onBlur={(e) => onDone(e.currentTarget.value.trim())}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone("");
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <span className="syl-bar" role="img" aria-label={`${Math.round(value * 100)}%`}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}
