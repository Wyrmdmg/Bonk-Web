import { useEffect, useMemo, useState } from "react";
import { XPIcon } from "@/components/XPIcon";
import {
  DAY,
  addDeck,
  allCards,
  decks,
  dueCards,
  logReview,
  parseCards,
  removeDeck,
  review,
  saveDeck,
  sched,
  type Card,
  type Deck,
  type Grade,
  type Sched,
} from "@/lib/cards";
import { playSound } from "@/lib/sound";
import { useT, type StringKey } from "@/lib/i18n";

const GRADES: { grade: Grade; label: StringKey; cls: string }[] = [
  { grade: 1, label: "cardAgain", cls: "is-again" },
  { grade: 2, label: "cardHard", cls: "is-hard" },
  { grade: 3, label: "cardGood", cls: "is-good" },
  { grade: 4, label: "cardEasy", cls: "is-easy" },
];

export function Cards() {
  const { t } = useT();
  const table = sched.use();
  const list = decks.use();
  const all = useMemo(() => allCards(list), [list]);
  const [shown, setShown] = useState(false);
  const [tab, setTab] = useState<"study" | "deck" | "write">("study");
  const [done, setDone] = useState(0);
  // Bumped to start a fresh sitting, which is the only thing "rescan" means
  // now that the decks are already in memory rather than on a disk.
  const [sitting, setSitting] = useState(0);

  const refresh = () => {
    setDone(0);
    setShown(false);
    setSitting((n) => n + 1);
  };

  // The queue is frozen for the sitting. Recomputing it after each answer
  // would pull a card you just failed straight back to the front, which is not
  // a review, it is a staring contest.
  const queue = useMemo(
    () => dueCards(all, sched.get()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sitting],
  );
  const card = queue[done];

  const answer = (grade: Grade) => {
    if (!card) return;
    // Logged before the schedule moves, because what the curve wants is how
    // long the card had been away when it was asked, not where it goes next.
    logReview(sched.get()[card.id], grade);
    sched.update((prev) => ({ ...prev, [card.id]: review(prev[card.id], grade) }));
    setShown(false);
    setDone((n) => n + 1);
    playSound(grade === 1 ? "click" : "ding");
  };

  useEffect(() => {
    if (tab !== "study" || !card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!shown) setShown(true);
        else answer(3);
        return;
      }
      if (shown && e.key >= "1" && e.key <= "4") answer(Number(e.key) as Grade);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="cd">
      <nav className="fc-tabs">
        <button className={tab === "study" ? "is-on" : ""} onClick={() => setTab("study")}>
          {t("cardStudy")} ({Math.max(0, queue.length - done)})
        </button>
        <button className={tab === "deck" ? "is-on" : ""} onClick={() => setTab("deck")}>
          {t("cardDeck")} ({all.length})
        </button>
        <button className={tab === "write" ? "is-on" : ""} onClick={() => setTab("write")}>
          {t("cardWrite")} ({list.length})
        </button>
      </nav>

      {tab === "write" ? (
        <Writer list={list} />
      ) : tab === "deck" ? (
        <Deck cards={all} table={table} />
      ) : all.length === 0 ? (
        <div className="cd-empty">
          <XPIcon name="help" size={32} />
          <h3>{t("cardNoneTitle")}</h3>
          <p>{t("cardNoneWebBody")}</p>
          <code>{t("cardExample")}</code>
          <div className="cd-empty-btns">
            <button className="btn-base btn-primary" onClick={() => setTab("write")}>
              {t("cardWriteOne")}
            </button>
          </div>
        </div>
      ) : !card ? (
        <div className="cd-empty">
          <XPIcon name="star-gold" size={32} />
          <h3>{t("cardDoneTitle")}</h3>
          <p>{done > 0 ? `${done} ${t("cardReviewed")}` : t("cardNothingDue")}</p>
          <button className="btn-base btn-secondary" onClick={refresh}>
            {t("cardRescan")}
          </button>
        </div>
      ) : (
        <div className="cd-body">
          <div className="cd-card">
            <span className="cd-from">{card.note}</span>
            <p className="cd-q">{card.q}</p>
            {shown ? (
              <p className="cd-a">{card.a}</p>
            ) : (
              <button className="btn-base btn-secondary" onClick={() => setShown(true)}>
                {t("cardShow")}
              </button>
            )}
          </div>

          {shown && (
            <div className="cd-grades">
              {GRADES.map((g, i) => (
                <button
                  key={g.grade}
                  className={`cd-grade ${g.cls}`}
                  onClick={() => answer(g.grade)}
                >
                  <b>{t(g.label)}</b>
                  <em>{nextIn(t, review(table[card.id], g.grade).due)}</em>
                  <i>{i + 1}</i>
                </button>
              ))}
            </div>
          )}

          <div className="cd-progress">
            <div className="tm-bar">
              <span style={{ width: `${(done / Math.max(1, queue.length)) * 100}%` }} />
            </div>
            <span>
              {done} / {queue.length}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** How far off the next showing is, in the coarsest unit that is still true. */
function nextIn(t: (k: StringKey) => string, due: number): string {
  const ms = due - Date.now();
  if (ms < 60_000) return `<1${t("cardMin")}`;
  if (ms < DAY) return `${Math.round(ms / 60_000)}${t("cardMin")}`;
  return `${Math.round(ms / DAY)}${t("cardDay")}`;
}

function Deck({ cards, table }: { cards: Card[]; table: Record<string, Sched> }) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? cards.filter((c) => `${c.q} ${c.a} ${c.note}`.toLowerCase().includes(needle))
    : cards;

  return (
    <div className="cd-deck">
      <input
        className="cd-search"
        value={q}
        placeholder={t("cardSearch")}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="cd-list">
        {rows.map((c) => {
          const s = table[c.id];
          return (
            <li key={c.id}>
              <b>{c.q}</b>
              <span>{c.a}</span>
              <em>{c.note}</em>
              <i>{s ? nextIn(t, s.due) : t("cardNew")}</i>
            </li>
          );
        })}
        {rows.length === 0 && <li className="lk-empty">{t("nothingHere")}</li>}
      </ul>
    </div>
  );
}

/**
 * Where the cards are written.
 *
 * The desktop keeps decks in your vault as ordinary markdown files, so it
 * needs no editor of its own: you write notes and the cards fall out of them.
 * A browser has no vault, so this is the smallest thing that fills the gap. A
 * deck is still a note, not a form: you type prose and leave
 * `question :: answer` lines in it, exactly as you would there, and the same
 * parser reads both.
 *
 * That means a deck written here can be pasted into a note there and keeps
 * working, and the export in Display Properties writes the format Anki reads.
 */
function Writer({ list }: { list: Deck[] }) {
  const { t } = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const deck = list.find((d) => d.id === openId) ?? list[0] ?? null;
  const found = deck ? parseCards(deck.id, deck.text, deck.name).length : 0;

  return (
    <div className="cd-write">
      <div className="cd-decks">
        {list.map((d) => (
          <button
            key={d.id}
            className={deck?.id === d.id ? "is-on" : ""}
            onClick={() => setOpenId(d.id)}
          >
            {d.name || t("untitled")}
          </button>
        ))}
        <button
          className="cd-adddeck"
          aria-label={t("cardNewDeck")}
          onClick={() => {
            const name = window.prompt(t("cardDeckName"), "");
            if (name?.trim()) setOpenId(addDeck(name).id);
            playSound("click");
          }}
        >
          +
        </button>
      </div>

      {deck ? (
        <>
          <div className="cd-deckbar">
            <input
              value={deck.name}
              aria-label={t("cardDeckName")}
              onChange={(e) => saveDeck(deck.id, { name: e.target.value })}
            />
            <span>
              {found} {t("cardCount")}
            </span>
            <button
              className="br-mini"
              aria-label={t("remove")}
              onClick={() => {
                if (window.confirm(t("cardDeleteDeck"))) {
                  removeDeck(deck.id);
                  setOpenId(null);
                  playSound("close");
                }
              }}
            >
              ×
            </button>
          </div>
          <textarea
            className="cd-text"
            value={deck.text}
            placeholder={t("cardWriteHint")}
            spellCheck={false}
            onChange={(e) => saveDeck(deck.id, { text: e.target.value })}
          />
        </>
      ) : (
        <p className="br-empty">{t("cardNoDecks")}</p>
      )}
    </div>
  );
}
