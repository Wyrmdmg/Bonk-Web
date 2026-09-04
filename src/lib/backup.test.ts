import { expect, test } from "bun:test";
import { fromDelimited, toTsv, toDeckNote, type Pair } from "./backup";

test("a tab separated export reads back as what went in", () => {
  const pairs: Pair[] = [
    { q: "capital of France", a: "Paris" },
    { q: "H2O", a: "water" },
  ];
  expect(fromDelimited(toTsv(pairs))).toEqual(pairs);
});

test("commas survive, because the separator is worked out from the file", () => {
  // A comma inside an answer is common; a tab inside one is not, which is why
  // tabs are written and why a tab in the first line wins.
  const pairs: Pair[] = [{ q: "list the halogens", a: "F, Cl, Br, I, At" }];
  expect(fromDelimited(toTsv(pairs))).toEqual(pairs);
});

test("comma separated input is read as comma separated", () => {
  expect(fromDelimited("front,back\nsecond,card")).toEqual([
    { q: "front", a: "back" },
    { q: "second", a: "card" },
  ]);
});

test("quoted fields keep their separators and their quotes", () => {
  expect(fromDelimited('"a, b","he said ""no"""')).toEqual([{ q: "a, b", a: 'he said "no"' }]);
});

test("a newline inside a quoted field does not end the row", () => {
  expect(fromDelimited('"two\nlines"\tanswer')).toEqual([{ q: "two\nlines", a: "answer" }]);
});

test("Anki's own directive lines are skipped", () => {
  expect(fromDelimited("#separator:tab\n#html:false\nfront\tback")).toEqual([
    { q: "front", a: "back" },
  ]);
});

test("blank rows and half rows are dropped rather than imported empty", () => {
  expect(fromDelimited("front\tback\n\nlonely\n\t\n")).toEqual([{ q: "front", a: "back" }]);
});

test("windows line endings are one break", () => {
  expect(fromDelimited("a\tb\r\nc\td\r\n")).toEqual([
    { q: "a", a: "b" },
    { q: "c", a: "d" },
  ]);
});

test("a byte order mark does not become part of the first question", () => {
  expect(fromDelimited("﻿front\tback")).toEqual([{ q: "front", a: "back" }]);
});

test("an empty file is no cards, not one blank card", () => {
  expect(fromDelimited("")).toEqual([]);
  expect(toTsv([])).toBe("");
});

test("a double colon in a card cannot split the deck line it is written to", () => {
  // Cards are `question :: answer` lines, so a :: inside either half would be
  // read as the separator on the way back in.
  const note = toDeckNote("Deck", [{ q: "what is a::b", a: "a scope" }]);
  const body = note.split("\n").find((l) => l.startsWith("- ")) ?? "";
  expect(body.split(" :: ").length).toBe(2);
});
