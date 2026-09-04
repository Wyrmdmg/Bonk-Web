// Two things that break silently and only in one stock, so nothing else catches them:
//   1. a colour token declared in :root but forgotten in [data-theme="dark"]
//      (that component then keeps the light value on a dark ground),
//   2. the pre-hydration bootstrap resolving a stored value to the wrong stock.
// Run: bun run check:theme
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function block(selector) {
  const at = css.indexOf(selector + " {");
  assert.notEqual(at, -1, `missing block: ${selector}`);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("\n}", open));
}
const declared = (body) => new Set([...body.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));

// Structural, deliberately shared by both stocks.
const SHARED = new Set(["--radius", "--stroke", "--shadow-hard", "--shadow-hard-active"]);

const light = declared(block(":root"));
const dark = declared(block('[data-theme="dark"]'));
const missing = [...light].filter((t) => !SHARED.has(t) && !dark.has(t));
assert.deepEqual(missing, [], `tokens missing from the dark stock: ${missing.join(", ")}`);

// --- bootstrap: legacy ids and no-preference both have to land on a real stock.
const root = readFileSync(new URL("../src/routes/__root.tsx", import.meta.url), "utf8");
const snippet = root.match(/const themeBootstrap = `([\s\S]*?)`;/)[1].replace(/\\\\/g, "\\");

function resolve(stored, prefersDark, scheme = null) {
  const attrs = {};
  const store = new Map([
    ...(stored === null ? [] : [["wd.theme", stored]]),
    ...(scheme === null ? [] : [["wd.scheme", scheme]]),
  ]);
  const localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const document = {
    documentElement: {
      setAttribute: (k, v) => (attrs[k] = v),
      dataset: {},
      style: { setProperty() {} },
    },
  };
  const window = { matchMedia: () => ({ matches: prefersDark }) };
  new Function("localStorage", "document", "window", "JSON", snippet)(
    localStorage,
    document,
    window,
    JSON,
  );
  return {
    attr: attrs["data-theme"],
    scheme: attrs["data-scheme"],
    saved: store.get("wd.theme"),
    savedScheme: store.get("wd.scheme"),
  };
}

for (const [stored, prefersDark, want] of [
  ["dark", false, "dark"],
  ["light", true, "light"],
  ["midnight", false, "dark"], // the old night theme
  ["kitchen", true, "light"], // old light themes stay light even on a dark OS
  ["paper", true, "light"],
  ["forest", true, "light"],
  [null, true, "dark"], // never chosen -> follow the OS
  [null, false, "light"],
]) {
  const { attr, saved } = resolve(stored, prefersDark);
  assert.equal(attr, want, `stored=${stored} prefersDark=${prefersDark} -> ${attr}, want ${want}`);
  assert.equal(saved, want, `stored=${stored} should be normalised in storage`);
}

// --- the scheme is the source of truth: the stock is whichever one it belongs
// to, so a stored pair that disagrees cannot leave the two attributes at odds.
for (const [scheme, stored, wantTheme, wantScheme] of [
  ["olive", "dark", "light", "olive"], // scheme wins; the stored stock is stale
  ["midnight", "light", "dark", "midnight"],
  ["silver", null, "light", "silver"],
  ["nonsense", "dark", "dark", "midnight"], // unknown id falls back through the stock
  [null, "light", "light", "blue"],
]) {
  const r = resolve(stored, false, scheme);
  assert.equal(r.attr, wantTheme, `scheme=${scheme} stored=${stored} -> theme ${r.attr}`);
  assert.equal(r.scheme, wantScheme, `scheme=${scheme} stored=${stored} -> scheme ${r.scheme}`);
  assert.equal(r.savedScheme, wantScheme, `scheme=${scheme} should be normalised in storage`);
}

// Every scheme the picker offers has to be one the bootstrap will accept, or
// choosing it works until the next reload and then silently reverts.
const schemeSrc = readFileSync(new URL("../src/lib/scheme.ts", import.meta.url), "utf8");
const offered = [...schemeSrc.matchAll(/\{\s*id: "([\w-]+)"/g)].map((m) => m[1]);
assert.ok(
  offered.length >= 2,
  `SCHEMES parsed as ${offered.length} entries, which cannot be right`,
);
for (const id of offered) {
  assert.equal(resolve(null, false, id).scheme, id, `bootstrap drops the "${id}" scheme`);
}

// --- contrast: the pairings that actually get drawn, in both stocks.
// This is the guard for the reported "buttons are not visible properly": a token
// used as text against a ground it inverts away from reads fine in one stock and
// vanishes in the other, and nothing else catches it.
const hexes = (body) =>
  Object.fromEntries(
    [...body.matchAll(/^\s*(--[\w-]+):\s*(#[0-9a-fA-F]{3,8});/gm)].map((m) => [m[1], m[2]]),
  );

function luminance(hex) {
  const h = hex.slice(1);
  const n = h.length === 3 ? [...h].map((c) => c + c) : h.match(/../g).slice(0, 3);
  const [r, g, b] = n.map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const FOCUS_LABEL = "#14140f"; // pinned label on the flame fill, in every stock
const stocks = {
  light: hexes(block(":root")),
  dark: hexes(block('[data-theme="dark"]')),
};
// The focus panel and the selected file row keep a dark ground in both stocks;
// the light stock flips its tokens locally to match.
const focusLight = hexes(block(':root:not([data-theme="dark"]) .panel-focus'));

let checked = 0;
for (const [name, t] of Object.entries(stocks)) {
  const focus = name === "light" ? { ...t, ...focusLight } : t;
  const pairs = [
    ["body text on panel", t["--ink"], t["--bone"], 7],
    ["body text on recessed fill", t["--ink"], t["--sage"], 7],
    ["muted text on panel", t["--ink-soft"], t["--bone"], 4.5],
    ["muted text on recessed fill", t["--ink-soft"], t["--sage"], 4.5],
    ["titlebar text", t["--bar-ink"], t["--bar"], 7],
    // The caption is a gradient, so its light stop is a ground for the same
    // white label the bar carries. Checking only --bar misses half the strip.
    ["titlebar text on the gradient's light stop", t["--bar-ink"], t["--bar-2"], 4.5],
    ["section bar text", t["--bar-ink"], t["--bar-sub"], 7],
    ["section bar text on its light stop", t["--bar-ink"], t["--bar-sub-2"], 4.5],
    ["titlebar muted text", t["--bone-soft"], t["--bar"], 4.5],
    ["primary button label", FOCUS_LABEL, t["--flame"], 4.5],
    ["secondary button label", t["--ink"], t["--face-lo"], 7],
    ["focus panel text", focus["--ink"], t["--olive"], 4.5],
    ["focus panel muted text", focus["--ink-soft"], t["--olive"], 3],
    ["selected file row", t["--sel-ink"], t["--sel"], 4.5],
  ];
  for (const [what, fg, bg, min] of pairs) {
    assert.ok(fg && bg, `${name}: ${what} — missing a colour`);
    const r = ratio(fg, bg);
    assert.ok(r >= min, `${name}: ${what} is ${r.toFixed(2)}:1 (${fg} on ${bg}), want >= ${min}`);
    checked++;
  }
}

// A scheme moves the caption, the section bar, the selection and the hero panel.
// It inherits every text token from the light stock, so the same pairings have
// to hold again against its own grounds or one scheme reads fine and another
// does not.
let schemeChecked = 0;
for (const id of offered) {
  const body = css.slice(css.indexOf(`:root[data-scheme="${id}"] {`));
  if (!body.startsWith(`:root[data-scheme="${id}"]`)) continue; // no overrides: it is a stock
  const t = { ...stocks.light, ...hexes(block(`:root[data-scheme="${id}"]`)) };
  const focus = { ...t, ...focusLight };
  for (const [what, fg, bg, min] of [
    ["titlebar text", t["--bar-ink"], t["--bar"], 7],
    ["titlebar text on the gradient's light stop", t["--bar-ink"], t["--bar-2"], 4.5],
    ["section bar text", t["--bar-ink"], t["--bar-sub"], 7],
    ["section bar text on its light stop", t["--bar-ink"], t["--bar-sub-2"], 4.5],
    ["titlebar muted text", t["--bone-soft"], t["--bar"], 4.5],
    ["selected file row", t["--sel-ink"], t["--sel"], 4.5],
    ["focus panel text", focus["--ink"], t["--olive"], 4.5],
    ["focus panel muted text", focus["--ink-soft"], t["--olive"], 3],
  ]) {
    assert.ok(fg && bg, `${id}: ${what} — missing a colour`);
    const r = ratio(fg, bg);
    assert.ok(r >= min, `${id}: ${what} is ${r.toFixed(2)}:1 (${fg} on ${bg}), want >= ${min}`);
    schemeChecked++;
  }
}

console.log(`ok — ${light.size} tokens inverted, 13 bootstrap cases, ${checked} contrast pairs`);
console.log(`ok — ${schemeChecked} contrast pairs across the colour schemes`);

// --- the desktop ground has to sit on an element that fills the viewport.
// Every window, the taskbar and the icons are position: fixed, so <body> has a
// 0px-tall box; and the base layer gives <html> a background of its own, which
// stops <body>'s from ever propagating to the canvas. Declared on <body>, the
// wallpaper is painted nowhere at all, and the picker looks broken while its own
// preview — which reads the variables directly — shows the change.
const ground = /(^|\n)(html|body)\s*\{[^}]*background-color:\s*var\(--wall-color/gm;
const grounds = [...css.matchAll(ground)].map((m) => m[2]);
assert.ok(grounds.length > 0, "nothing declares the desktop ground from --wall-color");
assert.deepEqual(
  grounds.filter((el) => el !== "html"),
  [],
  "the desktop ground must be declared on <html>: on <body> it is painted on a zero-height box",
);
console.log("ok — the desktop ground is on an element that fills the viewport");

// --- derived tokens inside locally-flipped grounds.
// --input/--panel/--border and friends are declared on :root as var(--bone) /
// var(--ink). A var() inside a custom-property *declaration* resolves at the
// declaring element and then inherits as a fixed value, so it does NOT follow a
// local override. The focus panel flips --bone/--ink locally, and any field that
// still read --input painted itself root-cream under a cream label.
const focusBlock = block(':root:not([data-theme="dark"]) .panel-focus');
const focusVars = hexes(focusBlock);
for (const derived of ["--input", "--panel", "--card"]) {
  assert.equal(
    focusVars[derived],
    focusVars["--bone"],
    `${derived} must be re-declared to match --bone inside the focus panel, or fields there keep the root ground`,
  );
}
assert.equal(
  focusVars["--border"],
  focusVars["--ink"],
  "--border must match --ink inside the focus panel",
);
assert.equal(
  focusVars["--foreground"],
  focusVars["--ink"],
  "--foreground must match --ink inside the focus panel",
);
console.log("ok — derived tokens follow the focus panel flip");

// --- assets: a PixelIcon whose file is absent renders as a broken-image box.
// `r10c14` was doing exactly that in the coin counter, on every page.
import { readdirSync } from "node:fs";
const iconDir = new URL("../public/ui/a/", import.meta.url);
const haveIcons = new Set(readdirSync(iconDir).map((f) => f.replace(/\.png$/, "")));
const srcDir = new URL("../src/", import.meta.url);
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(new URL(e.name + "/", dir)) : [new URL(e.name, dir)],
  );
}
const used = new Set();
for (const f of walk(srcDir)) {
  if (!/\.tsx?$/.test(f.pathname)) continue;
  for (const m of readFileSync(f, "utf8").matchAll(/<PixelIcon\s[^>]*name="([^"]+)"/g))
    used.add(m[1]);
}
const missingIcons = [...used].filter((n) => !haveIcons.has(n));
assert.deepEqual(
  missingIcons,
  [],
  `PixelIcon names with no file in public/ui/a: ${missingIcons.join(", ")}`,
);
console.log(`ok — ${used.size} icon names all present`);

// --- the Windows sheet: a coordinate off the edge renders an empty box, and
// nothing in the type system knows how wide the picture is.
import { statSync } from "node:fs";
const SHEET_COLS = 23;
const SHEET_ROWS = 22;
statSync(new URL("../public/xp/icons32.png", import.meta.url));
const xpSrc = readFileSync(new URL("../src/components/XPIcon.tsx", import.meta.url), "utf8");
const table = xpSrc.slice(xpSrc.indexOf("export const XP_ICONS"), xpSrc.indexOf("} as const;"));
const cells = [...table.matchAll(/^\s*"?([\w-]+)"?:\s*\[(\d+),\s*(\d+)\]/gm)];
assert.ok(cells.length >= 15, `XP_ICONS parsed as ${cells.length} entries, which cannot be right`);
for (const [, name, c, r] of cells) {
  assert.ok(
    Number(c) < SHEET_COLS && Number(r) < SHEET_ROWS,
    `XP icon "${name}" at [${c}, ${r}] is off the ${SHEET_COLS}x${SHEET_ROWS} sheet`,
  );
}
// The titlebar draws its window icon straight from the sheet in CSS, so its
// hand-computed offsets have to agree with the same geometry.
const bar = css.slice(css.indexOf("@utility titlebar"), css.indexOf("@utility section-bar"));
const size = Number(/background-size:\s*(\d+)px auto/.exec(bar)[1]);
const [, bx, by] = /background-position:\s*(-?\d+)px\s*(-?\d+)px/.exec(bar).map(Number);
const cell = size / SHEET_COLS;
assert.equal(cell, 16, `titlebar icon cell resolves to ${cell}px, want 16`);
assert.ok(
  Number.isInteger(-bx / cell) &&
    Number.isInteger(-by / cell) &&
    -bx / cell < SHEET_COLS &&
    -by / cell < SHEET_ROWS,
  `titlebar icon lands at [${-bx / cell}, ${-by / cell}], which is not a cell on the sheet`,
);
console.log(`ok — ${cells.length} sheet coordinates on the sheet`);

// Windows stack in a band that must end below the taskbar. The band is capped
// in windows.tsx against TASKBAR_Z; this checks that constant still matches the
// stylesheet, because the two drifting apart is exactly how a window ended up
// drawing over the clock.
{
  const bar = /\.taskbar\s*\{[^}]*z-index:\s*(\d+)/.exec(css);
  assert.ok(bar, "the taskbar must declare a z-index");
  const wm = readFileSync(new URL("../src/lib/windows.tsx", import.meta.url), "utf8");
  const konst = /TASKBAR_Z = (\d+)/.exec(wm);
  assert.ok(konst, "windows.tsx must export TASKBAR_Z");
  assert.equal(
    konst[1],
    bar[1],
    "TASKBAR_Z and the taskbar's z-index must agree, or windows can cover the taskbar",
  );
  console.log(`ok — windows stack below the taskbar at z-index ${bar[1]}`);
}
