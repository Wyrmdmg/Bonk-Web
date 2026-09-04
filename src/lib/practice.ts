import { makeStore, uid } from "@/lib/store";

/**
 * Practice: questions to sit, and the mistakes that came out of sitting them.
 *
 * These are one file because they are one loop. A question you get wrong
 * becomes a mistake with a reason attached, and a mistake worth logging is
 * usually worth asking again. Splitting them would mean two stores that have
 * to agree about which question a mistake came from.
 *
 * Separate from flashcards on purpose. A card is a fact you want back in under
 * a second; a question is a problem you sit down and work. They want different
 * screens, different timing and different scoring, and the one place they meet
 * is that both live in your own notes.
 */
export type Kind = "choice" | "short" | "open";

export type Question = {
  id: string;
  setId: string;
  kind: Kind;
  prompt: string;
  /** For "choice". The first is the right one; they are shuffled when asked. */
  options: string[];
  /** For "short", the accepted answer. For "open", the model answer to compare
   *  your own against, since nothing here can mark an essay. */
  answer: string;
  /** Worked solution or reference, shown after answering. */
  note: string;
  /** A syllabus topic, when it belongs to one. */
  topicId: string | null;
};

export type QuestionSet = {
  id: string;
  name: string;
  /** Minutes for the whole set, or 0 for untimed. */
  minutes: number;
  at: number;
};

/** One sitting. Kept so a set can be taken again and compared. */
export type Attempt = {
  id: string;
  setId: string;
  at: number;
  /** Seconds actually spent, which is not the limit when it was finished early. */
  seconds: number;
  right: number;
  total: number;
};

export type Cause = "concept" | "method" | "slip" | "misread" | "time";

/** Why it went wrong. Five, because a list long enough to need thinking about
 *  is a list nobody fills in. */
export const CAUSES: Cause[] = ["concept", "method", "slip", "misread", "time"];

export type Mistake = {
  id: string;
  at: number;
  /** What was asked. Free text, so a mistake can come from a past paper, a
   *  lesson or anywhere else, not only from a question in here. */
  prompt: string;
  /** What you put. */
  gave: string;
  /** What it should have been. */
  correct: string;
  cause: Cause;
  /** What you now understand that you did not. The part that does the work. */
  fix: string;
  topicId: string | null;
  /** Cleared once you can do it again, kept rather than deleted so the log
   *  still shows what used to catch you out. */
  resolved: boolean;
};

export const sets = makeStore<QuestionSet[]>("bonk.practice.sets", [], (raw) =>
  (Array.isArray(raw) ? raw : []).map((r) => {
    const s = r as Partial<QuestionSet>;
    return {
      id: String(s.id ?? uid()),
      name: String(s.name ?? ""),
      minutes: Number(s.minutes) || 0,
      at: Number(s.at) || 0,
    };
  }),
);

export const questions = makeStore<Question[]>("bonk.practice.questions", [], (raw) =>
  (Array.isArray(raw) ? raw : []).map((r) => {
    const q = r as Partial<Question>;
    return {
      id: String(q.id ?? uid()),
      setId: String(q.setId ?? ""),
      kind: (["choice", "short", "open"] as Kind[]).includes(q.kind as Kind)
        ? (q.kind as Kind)
        : "short",
      prompt: String(q.prompt ?? ""),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      answer: String(q.answer ?? ""),
      note: String(q.note ?? ""),
      topicId: q.topicId ?? null,
    };
  }),
);

export const attempts = makeStore<Attempt[]>("bonk.practice.attempts", []);

export const mistakes = makeStore<Mistake[]>("bonk.practice.mistakes", [], (raw) =>
  (Array.isArray(raw) ? raw : []).map((r) => {
    const m = r as Partial<Mistake>;
    return {
      id: String(m.id ?? uid()),
      at: Number(m.at) || Date.now(),
      prompt: String(m.prompt ?? ""),
      gave: String(m.gave ?? ""),
      correct: String(m.correct ?? ""),
      cause: CAUSES.includes(m.cause as Cause) ? (m.cause as Cause) : "concept",
      fix: String(m.fix ?? ""),
      topicId: m.topicId ?? null,
      resolved: !!m.resolved,
    };
  }),
);

/**
 * Whether a short answer counts.
 *
 * Case, surrounding space and the difference between a hyphen and a dash are
 * not what is being tested, so none of them fail you. Anything beyond that is
 * marked by you: a machine that decides whether your wording of an explanation
 * is right will be wrong often enough to be worth less than nothing.
 */
export function matches(given: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[‐-―]/g, "-")
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  return norm(given) === norm(expected) && norm(given).length > 0;
}

/** A stable shuffle for one sitting: the same seed gives the same order, so a
 *  re-render does not move the options out from under the pointer. */
export function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    // A small deterministic generator. Nothing here needs to be unguessable.
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const questionsIn = (list: Question[], setId: string) =>
  list.filter((q) => q.setId === setId);

/** How the mistakes break down by cause, which is the whole point of writing
 *  the cause down: four slips is a different problem from four concept gaps. */
export function byCause(list: Mistake[]) {
  const out = {} as Record<Cause, number>;
  for (const c of CAUSES) out[c] = 0;
  for (const m of list) if (!m.resolved) out[m.cause]++;
  return out;
}

export const blankSet = (): QuestionSet => ({ id: uid(), name: "", minutes: 0, at: Date.now() });

export const blankQuestion = (setId: string): Question => ({
  id: uid(),
  setId,
  kind: "short",
  prompt: "",
  options: ["", ""],
  answer: "",
  note: "",
  topicId: null,
});

export const blankMistake = (): Mistake => ({
  id: uid(),
  at: Date.now(),
  prompt: "",
  gave: "",
  correct: "",
  cause: "concept",
  fix: "",
  topicId: null,
  resolved: false,
});

const upsert = <T extends { id: string }>(list: T[], row: T) =>
  list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row];

export const saveSet = (s: QuestionSet) => sets.set(upsert(sets.get(), s));
export const saveQuestion = (q: Question) => questions.set(upsert(questions.get(), q));
export const saveMistake = (m: Mistake) => mistakes.set(upsert(mistakes.get(), m));

/** Deleting a set takes its questions. Leaving them behind pointing at a set
 *  that is gone is how a store quietly fills with rows nothing can reach. */
export function removeSet(id: string) {
  sets.set(sets.get().filter((s) => s.id !== id));
  questions.set(questions.get().filter((q) => q.setId !== id));
  attempts.set(attempts.get().filter((a) => a.setId !== id));
}

export const removeQuestion = (id: string) =>
  questions.set(questions.get().filter((q) => q.id !== id));

export const removeMistake = (id: string) =>
  mistakes.set(mistakes.get().filter((m) => m.id !== id));

export const logAttempt = (a: Omit<Attempt, "id">) =>
  attempts.set([...attempts.get(), { ...a, id: uid() }]);
