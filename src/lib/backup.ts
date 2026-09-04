/**
 * Taking your work with you.
 *
 * Everything Bonk knows is in localStorage under a handful of keys, so a
 * backup is those keys and nothing else. Deliberately a plain readable JSON
 * object rather than an archive: you should be able to open a backup, see your
 * own study history in it, and fix it by hand if you ever have to.
 *
 * On the desktop app this leaves files out, because notes and drawings are
 * already ordinary files on a disk you can copy. In a browser there is no such
 * disk, so this really is everything: the file it writes is the only copy of
 * your work that exists anywhere off this machine, which is why the panel that
 * calls it says so plainly.
 *
 * The format matches the desktop's, key for key, so a backup taken in either
 * one restores into the other and carries whatever the two have in common.
 */
export const BACKUP_VERSION = 1;

/** Every key this app owns. A backup that silently skips a store is worse than
 *  no backup, so this is the one list and both directions read it. */
export const KEYS = [
  "bonk.decks",
  "bonk.cards.sched",
  "bonk.cards.reviews",
  "bonk.syllabus",
  "bonk.exams",
  "bonk.practice.sets",
  "bonk.practice.questions",
  "bonk.practice.attempts",
  "bonk.practice.mistakes",
  "bonk.alarm.v3",
  "bonk.status-pref",
  "wd.notes",
  "wd.journal",
  "wd.calendar",
  "wd.solo.session.v1",
  "wd.ambient",
  "wd.companion",
  "wd.rail",
  "wd.customThemes",
  "wd.activeCustomTheme",
  "wd.scheme",
  "wd.lightScheme",
  "wd.theme",
  "wd.wall",
  "wd.wallTint",
  "wd.lang",
  "wd.sound",
  "wd.sidebar",
] as const;

export type Backup = {
  app: "bonk";
  version: number;
  at: string;
  data: Record<string, unknown>;
};

export function exportAll(): Backup {
  const data: Record<string, unknown> = {};
  for (const key of KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      // A key that is not JSON is still someone's data. Keep the text.
      data[key] = raw;
    }
  }
  return { app: "bonk", version: BACKUP_VERSION, at: new Date().toISOString(), data };
}

export type ImportMode = "replace" | "merge";

export type ImportResult = { restored: string[]; skipped: string[] };

/**
 * Put a backup back.
 *
 * "replace" is what you want on a new machine: the file becomes the truth and
 * anything here that the file also has is overwritten. "merge" is for pulling
 * one machine's history into another: rows are joined by id and anything with
 * an id already present is left alone, so the copy you are sitting in front of
 * wins any disagreement.
 *
 * Only keys this app owns are touched. A file claiming a key outside the list
 * is ignored rather than trusted, because an import is a file from anywhere.
 */
export function importAll(backup: unknown, mode: ImportMode = "replace"): ImportResult {
  const b = backup as Partial<Backup>;
  if (!b || b.app !== "bonk" || typeof b.data !== "object" || !b.data)
    throw new Error("Not a Bonk backup");

  const known = new Set<string>(KEYS);
  const restored: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(b.data)) {
    if (!known.has(key)) {
      skipped.push(key);
      continue;
    }
    try {
      localStorage.setItem(key, JSON.stringify(mode === "merge" ? merge(key, value) : value));
      restored.push(key);
    } catch {
      skipped.push(key);
    }
  }
  return { restored, skipped };
}

/** Arrays of rows with ids are joined; anything else the incoming value only
 *  fills a gap, because there is no sensible way to merge two settings objects
 *  and quietly picking one is how a merge loses a preference. */
function merge(key: string, incoming: unknown): unknown {
  const rawHere = localStorage.getItem(key);
  if (rawHere === null) return incoming;
  let here: unknown;
  try {
    here = JSON.parse(rawHere);
  } catch {
    return incoming;
  }
  if (!Array.isArray(here) || !Array.isArray(incoming)) return here;

  const ids = new Set(
    here.map((r) => (r && typeof r === "object" ? (r as { id?: string }).id : undefined)),
  );
  const extra = incoming.filter((r) => {
    const id = r && typeof r === "object" ? (r as { id?: string }).id : undefined;
    // A row with no id cannot be told apart from one already here, so it is
    // added: a duplicate you can delete beats a row silently dropped.
    return id === undefined || !ids.has(id);
  });
  return [...here, ...extra];
}

/* ---- flashcards, as text ------------------------------------------------
   Anki's own .apkg is a zip around a SQLite database, and reading it would
   mean shipping a SQLite engine in a study app that is meant to stay small.
   Its text export is the format Anki documents for exchange, every other tool
   speaks it, and it is what the import dialog offers by default. So that is
   what this reads and writes.

   Tab separated, because a comma inside an answer is far more likely than a
   tab, and Anki defaults to tabs too. */

export type Pair = { q: string; a: string };

/** One row. A field holding a tab, a newline or a quote is quoted and its
 *  quotes doubled, which is the same escaping a spreadsheet uses. */
function field(s: string): string {
  return /["\t\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toTsv = (pairs: Pair[]) =>
  pairs.map((p) => `${field(p.q)}\t${field(p.a)}`).join("\n") + (pairs.length ? "\n" : "");

/** Splits on one known separator, respecting quotes. A quoted field may hold
 *  the separator, a line break, and doubled quotes standing for one. */
function rowsOf(body: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      if (c === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      // A CRLF is one break, not two.
      if (c === "\r" && body[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Anki writes its own settings as lines beginning with a hash. */
const usable = (rows: string[][]): Pair[] =>
  rows
    .filter((r) => r.length >= 2 && r[0].trim() && !r[0].startsWith("#"))
    .map((r) => ({ q: r[0].trim(), a: r[1].trim() }))
    .filter((p) => p.q && p.a);

/**
 * Reads tab or comma separated text, with or without quoting.
 *
 * Both separators are tried and whichever yields more usable rows wins, ties
 * going to tab since that is what is written here and what Anki defaults to.
 *
 * Sniffing the first line instead, which is the obvious way, is wrong twice
 * over: Anki's exports open with `#separator:tab`, which contains no tab, and
 * a first field holding a quoted line break means the first line is not a row
 * at all. Both cases picked commas and read the whole file as a single column.
 */
export function fromDelimited(text: string): Pair[] {
  const body = text.replace(/^\uFEFF/, "");
  const tabs = usable(rowsOf(body, "\t"));
  const commas = usable(rowsOf(body, ","));
  return commas.length > tabs.length ? commas : tabs;
}

/** Cards live as `question :: answer` lines in a deck, so an import is a deck
 *  and not a new store. This is the deck's text. */
export const toDeckNote = (title: string, pairs: Pair[]) =>
  `# ${title}\n\n` +
  pairs
    // A double colon inside either half would split the line somewhere else on
    // the way back in, so it is spaced out rather than silently corrupting.
    .map((p) => `- ${p.q.replace(/::/g, ": :")} :: ${p.a.replace(/::/g, ": :")}`)
    .join("\n") +
  "\n";

export const stamp = () => new Date().toISOString().slice(0, 10);
