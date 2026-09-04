import { makeStore, uid } from "@/lib/store";

/**
 * Spaced repetition, the same scheduler and the same card syntax as the
 * desktop app.
 *
 * The one difference is where the text lives. On the desktop a deck is a note
 * in your vault folder, because there is a disk to put it on. Here a deck is a
 * note in this browser. Everything downstream is identical: the same
 * `question :: answer` lines, the same parser, the same SM-2 schedule, so a
 * deck exported here imports there and the other way round.
 */

/** A deck is a note, not a table of cards. Writing prose and leaving a few
 *  `question :: answer` lines in it is the whole authoring step. */
export type Deck = { id: string; name: string; text: string; updated: number };

export const decks = makeStore<Deck[]>("bonk.decks", [], (raw) =>
  (Array.isArray(raw) ? raw : [])
    .filter((d): d is Deck => !!d && typeof (d as Deck).id === "string")
    .map((d) => ({
      id: d.id,
      name: String(d.name ?? ""),
      text: String(d.text ?? ""),
      updated: Number(d.updated) || 0,
    })),
);

export function addDeck(name: string, text = ""): Deck {
  const d: Deck = { id: uid(), name: name.trim(), text, updated: Date.now() };
  decks.set([...decks.get(), d]);
  return d;
}

export const saveDeck = (id: string, patch: Partial<Deck>) =>
  decks.set(decks.get().map((d) => (d.id === id ? { ...d, ...patch, updated: Date.now() } : d)));

export const removeDeck = (id: string) => decks.set(decks.get().filter((d) => d.id !== id));

/** A card is a line in a deck. There is no card record, no import step and
 *  nothing to keep in step: the note is the deck. */
export type Card = { id: string; q: string; a: string; path: string; note: string };

/** Where a card sits in its schedule. `due` is epoch ms, `interval` is whole
 *  days, `ease` is the SM-2 factor. */
export type Sched = { due: number; interval: number; ease: number; reps: number };

/** 1 again, 2 hard, 3 good, 4 easy. Kept as a small closed set rather than
 *  SM-2's 0..5, because six shades of "how did that go" is a decision nobody
 *  wants to make forty times in a sitting. */
export type Grade = 1 | 2 | 3 | 4;

export const DAY = 86_400_000;

/** Lines like `capital of France :: Paris`. Chosen because it is the one
 *  convention that reads fine as ordinary prose when you are not revising, so
 *  a note does not have to become a deck to hold a card. Fenced code is
 *  skipped: `a :: b` inside a snippet is code, not a question. */
const CARD_RE = /^\s{0,3}(?:[-*+]\s+)?(.+?)\s+::\s+(.+?)\s*$/;

export function parseCards(path: string, text: string, note = path): Card[] {
  const out: Card[] = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = CARD_RE.exec(line);
    if (!m) continue;
    const q = m[1].trim();
    const a = m[2].trim();
    if (!q || !a) continue;
    out.push({ id: cardId(path, q), q, a, path, note });
  }
  return out;
}

/**
 * A card's identity is its file and its question, so fixing a typo in an
 * answer keeps the schedule, while rewriting the question starts a new card.
 * That is the right way round: a changed answer is a correction, a changed
 * question is a different thing to remember.
 */
export function cardId(path: string, q: string): string {
  let h = 0x811c9dc5;
  const s = `${path}\n${q}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const NEW_CARD: Sched = { due: 0, interval: 0, ease: 2.5, reps: 0 };

/**
 * SM-2. A card you get wrong comes back in the same sitting rather than
 * tomorrow, which is the one deviation from the paper and the one everybody
 * makes: waiting a day to re-see a card you just failed wastes the day.
 */
export function review(prev: Sched | undefined, grade: Grade, now = Date.now()): Sched {
  const s = prev ?? NEW_CARD;

  if (grade === 1) {
    return {
      due: now + 10 * 60_000,
      interval: 0,
      ease: Math.max(1.3, s.ease - 0.2),
      reps: 0,
    };
  }

  const reps = s.reps + 1;
  const interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.max(1, Math.round(s.interval * s.ease));
  // SM-2's factor update, with grade 1..4 standing in for its q of 2..5.
  const q = grade + 1;
  const ease = Math.max(1.3, s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { due: now + interval * DAY, interval, ease, reps };
}

export const sched = makeStore<Record<string, Sched>>("bonk.cards.sched", {});

/**
 * One line per answer given, which is what a retention curve is made of.
 *
 * The schedule table only ever holds where a card is now, so "how well was I
 * recalling things three weeks ago" was a question nothing here could answer.
 * This keeps the grade and the age of the card at the moment it was asked.
 *
 * `days` is how long since that card was last seen, which is the axis the
 * curve is actually about: recall against elapsed time, not against date.
 */
export type Review = { at: number; grade: Grade; days: number };

/** Two years of answers at a hundred a day is 73k rows and about 2MB of
 *  localStorage, which is over the usual 5MB budget once everything else is
 *  counted. The oldest go first; a curve does not get better for being older. */
const REVIEW_CAP = 20_000;

export const reviews = makeStore<Review[]>("bonk.cards.reviews", [], (raw) =>
  (Array.isArray(raw) ? raw : [])
    .filter((r): r is Review => !!r && typeof (r as Review).at === "number")
    .slice(-REVIEW_CAP),
);

export function logReview(prev: Sched | undefined, grade: Grade, now = Date.now()) {
  // A card seen for the first time has no elapsed time to speak of, so it is
  // recorded at zero days rather than left out: how new cards go is part of
  // the picture too.
  const days = prev && prev.interval > 0 ? prev.interval : 0;
  const next = [...reviews.get(), { at: now, grade, days }];
  reviews.set(next.length > REVIEW_CAP ? next.slice(-REVIEW_CAP) : next);
}

/** Buckets of elapsed days, and how often recall held in each.
 *
 *  Anything but "again" counts as recalled: hard, good and easy all mean the
 *  answer came back, which is what retention measures. */
export function retention(list: Review[], buckets = [1, 3, 7, 14, 30, 90, Infinity]) {
  const out = buckets.map((upTo, i) => ({
    upTo,
    from: i === 0 ? 0 : buckets[i - 1],
    kept: 0,
    total: 0,
  }));
  for (const r of list) {
    const b = out.find((x) => r.days <= x.upTo);
    if (!b) continue;
    b.total++;
    if (r.grade > 1) b.kept++;
  }
  return out;
}

export function isDue(card: Card, table: Record<string, Sched>, now = Date.now()) {
  const s = table[card.id];
  return !s || s.due <= now;
}

/** Cards to study now: anything never seen or past its due time. New cards go
 *  last so a big new note cannot bury the reviews that are actually due. */
export function dueCards(cards: Card[], table: Record<string, Sched>, now = Date.now()) {
  const ready = cards.filter((c) => isDue(c, table, now));
  return [
    ...ready.filter((c) => table[c.id]).sort((a, b) => table[a.id].due - table[b.id].due),
    ...ready.filter((c) => !table[c.id]),
  ];
}

/**
 * Every card in every deck.
 *
 * The deck id stands where the file path stands on the desktop, which is what
 * keeps `cardId` stable: renaming a deck leaves every schedule intact, because
 * identity is the deck it is in and the question it asks, never its title.
 */
export const allCards = (list: Deck[]): Card[] =>
  list.flatMap((d) => parseCards(d.id, d.text, d.name));

/**
 * A year of days and how many cards were answered on each, for the grid.
 *
 * Walks days rather than reviews, so a day with nothing on it is still a
 * square. The desktop draws the same grid from focus sessions, because it has
 * a timer that records them locally; here the honest local measure of "did you
 * study" is whether you answered any cards, which is a narrower question and
 * the only one this browser can answer on its own.
 */
export function reviewDays(list: Review[], days = 371, end = Date.now()) {
  const counts = new Map<string, number>();
  for (const r of list) {
    const k = dayKey(r.at);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: { day: string; date: Date; count: number }[] = [];
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const day = dayKey(d.getTime());
    out.push({ day, date: d, count: counts.get(day) ?? 0 });
  }
  return out;
}

/** Local date, not UTC: a card answered at eleven at night belongs to that
 *  evening, and toISOString would file it under tomorrow for most of the
 *  world. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Days in a row up to today. Today not being started yet does not break it:
 *  the count begins at yesterday in that case, so a streak is only lost by
 *  missing a whole day, not by being asked before you have sat down. */
export function reviewStreak(list: Review[], now = Date.now()): number {
  const seen = new Set(list.map((r) => dayKey(r.at)));
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!seen.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (seen.has(dayKey(cursor.getTime()))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}
