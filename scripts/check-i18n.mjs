// Every word the site can say has to come from the dictionary.
//
// This walks the JSX for text a person can read — element text, and the props
// that render as text — and fails on anything still written as a literal. That
// is what makes "the whole site is translated" checkable instead of a claim.
//
// Run: bun run check:i18n        List what is left: node scripts/check-i18n.mjs --list
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const SRC = new URL("../src/", import.meta.url);
const TEXT_PROPS = ["placeholder", "title", "aria-label", "alt", "label"];

/** Files whose strings are not user-facing text. */
const SKIP_FILES = [
  /\/lib\/i18n\//,
  /\.test\.tsx?$/,
  /\/components\/ui\//, // shadcn primitives: no copy of their own
  /\/integrations\//,
  /\.server\.ts$/,
  /\.functions\.ts$/,
];

/** Text that is not language: symbols, numbers, and single lowercase tokens. */
const NOT_WORDS = /^[\s\d\p{P}\p{S}]*$|^[a-z][a-zA-Z0-9]*$/u;

/** A `>...<` match that is really TypeScript, not text. Generic parameters and
 *  arrow bodies live between the same two characters as a JSX text node. */
const LOOKS_LIKE_CODE =
  /[;=(){}[\]]|=>|&&|\|\||\w\.\w|\bconst\b|\buseState\b|\buseRef\b|\bPromise\b|\breturn\b|\bnull\b/;

const ALLOW = new Set([
  "Bonk",
  "Bonk Explorer",
  "Minesweeper",
  "Snake",
  "Notepad",
  "Display Properties",
  "Luna Blue",
  "Olive Green",
  "Silver",
  "Midnight",
  "English",
  "Español",
  "Français",
  "Deutsch",
  "日本語",
  "Spanish",
  "French",
  "German",
  "Japanese",
  "Wikipedia",
  "Internet Archive",
  "Project Gutenberg",
  "Open Library",
  "YouTube",
  // The window captions are filenames, not sentences: they name the route the
  // way a file manager would, and a filename does not get translated.
  "404.err",
  "about.md",
  "browse.html",
  "companion.dat",
  "leaderboard.log",
  "legal.txt",
  "login.sh",
  "profile.md",
  "room.exe",
  "settings.cfg",
  "shop.sh",
  "solo.exe",
  // Wordmark, protocol name, and the two ends of the slow-mode slider.
  "BONK",
  "OAuth",
  "1s",
  "60m",
  "account/",
  "rooms/",
]);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(new URL(e.name + "/", dir)) : [new URL(e.name, dir)],
  );
}

const findings = [];
for (const file of walk(SRC)) {
  const path = file.pathname;
  if (!/\.tsx$/.test(path)) continue;
  if (SKIP_FILES.some((re) => re.test(path))) continue;
  const src = readFileSync(file, "utf8");
  const rel = path.slice(path.indexOf("/src/") + 1);

  // JSX text nodes: >text< with no braces or tags inside.
  for (const m of src.matchAll(/>([^<>{}]{2,})</g)) {
    const text = m[1].replace(/\s+/g, " ").trim();
    if (!text || NOT_WORDS.test(text) || ALLOW.has(text)) continue;
    if (!/\p{L}/u.test(text) || LOOKS_LIKE_CODE.test(text)) continue;
    findings.push({ rel, text, line: src.slice(0, m.index).split("\n").length });
  }
  // Text-bearing props written as literals.
  for (const prop of TEXT_PROPS) {
    const re = new RegExp(`${prop}="([^"]{2,})"`, "g");
    for (const m of src.matchAll(re)) {
      const text = m[1].trim();
      if (!text || NOT_WORDS.test(text) || ALLOW.has(text)) continue;
      findings.push({ rel, text, line: src.slice(0, m.index).split("\n").length });
    }
  }
}

if (process.argv.includes("--list")) {
  const byFile = new Map();
  for (const f of findings) byFile.set(f.rel, [...(byFile.get(f.rel) ?? []), f]);
  for (const [rel, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${rel}  (${list.length})`);
    for (const f of list) console.log(`  ${String(f.line).padStart(4)}  ${f.text}`);
  }
  console.log(`\ntotal ${findings.length} literals in ${byFile.size} files`);
} else {
  assert.deepEqual(
    findings.map((f) => `${f.rel}:${f.line}  ${f.text}`),
    [],
    `user-facing text left as a literal (run: node scripts/check-i18n.mjs --list)`,
  );
  console.log("ok — no user-facing text is written as a literal");
}
