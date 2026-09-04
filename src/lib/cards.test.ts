import { expect, test } from "bun:test";
import {
  cardId,
  dayKey,
  parseCards,
  retention,
  review,
  reviewDays,
  reviewStreak,
  type Review,
} from "./cards";

const at = (daysAgo: number, hour = 12) => {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
};
const rev = (daysAgo: number, grade: 1 | 2 | 3 | 4 = 3, days = 0): Review => ({
  at: at(daysAgo),
  grade,
  days,
});

test("a card is any line written as question :: answer", () => {
  const cards = parseCards("d1", "intro\n\n- capital of France :: Paris\nnot a card\n", "Geo");
  expect(cards.map((c) => [c.q, c.a])).toEqual([["capital of France", "Paris"]]);
  expect(cards[0].note).toBe("Geo");
});

test("a fenced block is code, not cards", () => {
  const cards = parseCards("d1", "```\nMap :: Set\n```\nreal :: card\n");
  expect(cards.map((c) => c.q)).toEqual(["real"]);
});

test("identity survives a fixed answer but not a rewritten question", () => {
  expect(cardId("d1", "same")).toBe(cardId("d1", "same"));
  expect(cardId("d1", "same")).not.toBe(cardId("d1", "other"));
  // Identity hangs on the deck id, never the deck's title, so renaming a deck
  // cannot orphan every schedule in it.
  expect(cardId("d1", "same")).not.toBe(cardId("d2", "same"));
});

test("a failed card comes back in the sitting, not tomorrow", () => {
  const now = Date.now();
  const s = review({ due: 0, interval: 9, ease: 2.5, reps: 4 }, 1, now);
  expect(s.due - now).toBeLessThan(60 * 60_000);
  expect(s.reps).toBe(0);
  expect(s.ease).toBeCloseTo(2.3, 5);
});

test("ease never falls through the floor however often you fail", () => {
  let s = review(undefined, 1);
  for (let i = 0; i < 50; i++) s = review(s, 1);
  expect(s.ease).toBe(1.3);
});

test("the first two intervals are fixed, then it multiplies", () => {
  const a = review(undefined, 3);
  expect(a.interval).toBe(1);
  const b = review(a, 3);
  expect(b.interval).toBe(6);
  expect(review(b, 3).interval).toBeGreaterThan(6);
});

test("anything but again counts as recalled", () => {
  const bands = retention([rev(0, 1, 2), rev(0, 2, 2), rev(0, 4, 2)], [3, Infinity]);
  expect(bands[0]).toMatchObject({ kept: 2, total: 3 });
});

test("every day gets a square, including the empty ones", () => {
  const days = reviewDays([rev(2), rev(2), rev(0)], 5);
  expect(days).toHaveLength(5);
  expect(days.at(-1)?.count).toBe(1);
  expect(days.at(-3)?.count).toBe(2);
  expect(days.filter((d) => d.count === 0)).toHaveLength(3);
});

test("a day is where you were, not where UTC was", () => {
  // Half past eleven at night is still that evening. toISOString would file
  // this under the sixth for anyone east of London.
  expect(dayKey(new Date(2026, 0, 5, 23, 30).getTime())).toBe("2026-01-05");
});

test("a streak survives today being unstarted but not a missed day", () => {
  expect(reviewStreak([rev(1), rev(2), rev(3)])).toBe(3);
  expect(reviewStreak([rev(0), rev(1)])).toBe(2);
  expect(reviewStreak([rev(0), rev(1), rev(3)])).toBe(2);
  expect(reviewStreak([])).toBe(0);
});
