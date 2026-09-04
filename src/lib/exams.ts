import { makeStore, uid } from "@/lib/store";

/**
 * Exams, and how long is left.
 *
 * Deliberately not calendar events. An event is a thing that happens at a time
 * and is then over; an exam is a deadline that everything before it is aimed
 * at, and the useful question is never "when is it" but "how long have I got
 * and which one is closest". The two want different screens, so they are
 * different rows.
 */
export type Exam = {
  id: string;
  name: string;
  /** YYYY-MM-DD, local. Whole days, because nobody revises to the minute. */
  day: string;
  /** HH:MM, or empty for a day with no stated time. */
  at: string;
  /** A syllabus subject id, when it is for one. Free of the syllabus if not. */
  subjectId: string | null;
  note: string;
};

export const exams = makeStore<Exam[]>("bonk.exams", [], (raw) =>
  (Array.isArray(raw) ? raw : []).map((r) => {
    const e = r as Partial<Exam>;
    return {
      id: String(e.id ?? uid()),
      name: String(e.name ?? ""),
      day: String(e.day ?? ""),
      at: String(e.at ?? ""),
      subjectId: e.subjectId ?? null,
      note: String(e.note ?? ""),
    };
  }),
);

const pad = (n: number) => String(n).padStart(2, "0");

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * When an exam falls, as a moment.
 *
 * Built from parts rather than parsed from a string. `new Date("2026-06-01")`
 * is UTC midnight by specification, which in most of the world is the evening
 * before, and an exam countdown that is a day out is worse than no countdown.
 */
export function momentOf(e: Exam): number {
  const [y, m, d] = e.day.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  const [hh, mm] = e.at ? e.at.split(":").map(Number) : [9, 0];
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime();
}

/** Whole days from today to the exam's day, ignoring the time of day on both
 *  ends. Today is 0, tomorrow is 1, yesterday is -1. */
export function daysUntil(e: Exam, now = new Date()): number {
  const [y, m, d] = e.day.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  const then = new Date(y, m - 1, d).setHours(0, 0, 0, 0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  return Math.round((then - today) / 86_400_000);
}

/** Hours left, for the last day when days stop being the useful unit. */
export const hoursUntil = (e: Exam, now = Date.now()) =>
  Math.max(0, Math.ceil((momentOf(e) - now) / 3_600_000));

export type Urgency = "past" | "now" | "soon" | "near" | "far";

/**
 * How loudly to say it.
 *
 * The thresholds are where the advice actually changes: today is today, inside
 * a week is cramming, inside a month is a revision plan, and beyond that it is
 * a date you want to see but not be shouted at about.
 */
export function urgency(days: number): Urgency {
  if (days < 0) return "past";
  if (days === 0) return "now";
  if (days <= 7) return "soon";
  if (days <= 30) return "near";
  return "far";
}

/** Soonest first, and anything already sat falls to the bottom rather than
 *  being hidden: an exam you have taken is still worth seeing the week after. */
export function ordered(list: Exam[], now = new Date()): Exam[] {
  return [...list].sort((a, b) => {
    const da = daysUntil(a, now);
    const db = daysUntil(b, now);
    const pa = da < 0 ? 1 : 0;
    const pb = db < 0 ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return pa ? db - da : da - db;
  });
}

/** The next one that has not been sat, which is the only one most screens
 *  have room to mention. */
export const nextExam = (list: Exam[], now = new Date()): Exam | undefined =>
  ordered(list, now).find((e) => daysUntil(e, now) >= 0);

export const blank = (): Exam => ({
  id: uid(),
  name: "",
  day: dayKey(),
  at: "",
  subjectId: null,
  note: "",
});

export const saveExam = (e: Exam) =>
  exams.set(
    exams.get().some((x) => x.id === e.id)
      ? exams.get().map((x) => (x.id === e.id ? e : x))
      : [...exams.get(), e],
  );

export const removeExam = (id: string) => exams.set(exams.get().filter((e) => e.id !== id));
