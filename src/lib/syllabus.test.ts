import { expect, test } from "bun:test";
import {
  derive,
  outline,
  progress,
  subtree,
  tally,
  WEIGHT,
  type Status,
  type Topic,
} from "./syllabus";

let n = 0;
const t = (id: string, parentId: string | null, status: Status = "todo"): Topic => ({
  id,
  parentId,
  name: id,
  status,
  at: n++,
});

/** Chemistry with one unit, that unit with three topics. */
const tree = (a: Status, b: Status, c: Status): Topic[] => [
  t("chem", null),
  t("unit", "chem"),
  t("a", "unit", a),
  t("b", "unit", b),
  t("c", "unit", c),
];

test("a subtree is the root and everything under it", () => {
  const list = tree("todo", "todo", "todo");
  expect(subtree(list, "chem").sort()).toEqual(["a", "b", "c", "chem", "unit"]);
  expect(subtree(list, "unit").sort()).toEqual(["a", "b", "c", "unit"]);
  expect(subtree(list, "a")).toEqual(["a"]);
});

test("only the leaves count towards progress", () => {
  // The unit is mastered but its three topics are not. Counting the unit as a
  // fourth thing would put this above zero; it is the topics, so it is zero.
  const list = tree("todo", "todo", "todo").map((r) =>
    r.id === "unit" ? { ...r, status: "mastered" as Status } : r,
  );
  expect(progress(list, "chem")).toBe(0);
});

test("progress is the mean of the leaf weights", () => {
  expect(progress(tree("mastered", "mastered", "mastered"), "chem")).toBe(1);
  expect(progress(tree("todo", "todo", "todo"), "chem")).toBe(0);
  const mixed = progress(tree("mastered", "revising", "todo"), "chem");
  expect(mixed).toBeCloseTo((WEIGHT.mastered + WEIGHT.revising + WEIGHT.todo) / 3, 10);
});

test("revising is most of the way there, so the bar moves before the end", () => {
  // A bar that only moves when everything is finished says nothing all term.
  expect(progress(tree("revising", "revising", "revising"), "chem")).toBeGreaterThan(0.5);
  expect(progress(tree("learning", "learning", "learning"), "chem")).toBeGreaterThan(0);
});

test("a subject with nothing in it is zero, not a division by zero", () => {
  expect(progress([t("empty", null)], "empty")).toBe(0);
  expect(Number.isFinite(progress([t("empty", null)], "empty"))).toBe(true);
});

test("a lone subject counts as its own leaf", () => {
  expect(progress([t("solo", null, "mastered")], "solo")).toBe(1);
});

test("the tally counts leaves by status", () => {
  expect(tally(tree("mastered", "revising", "todo"), "chem")).toEqual({
    todo: 1,
    learning: 0,
    revising: 1,
    mastered: 1,
    total: 3,
  });
});

test("a cycle cannot hang the walk", () => {
  // Not reachable through the app, but a hand edited store can hold anything,
  // and a syllabus that freezes the desktop is worse than one that is wrong.
  const list: Topic[] = [t("x", "y"), t("y", "x")];
  expect(subtree(list, "x").sort()).toEqual(["x", "y"]);
});

test("a row whose parent is gone does not drag the walk in", () => {
  const list: Topic[] = [t("root", null), t("kid", "root"), t("orphan", "vanished")];
  expect(subtree(list, "root").sort()).toEqual(["kid", "root"]);
});

test("a branch is labelled by what is under it, not by its own stored status", () => {
  // The label used to come from the row, so a chapter whose topics were half
  // revised read "not started" next to a bar showing sixty per cent.
  expect(derive(progress(tree("todo", "todo", "todo"), "chem"))).toBe("todo");
  expect(derive(progress(tree("learning", "todo", "todo"), "chem"))).toBe("learning");
  expect(derive(progress(tree("mastered", "mastered", "revising"), "chem"))).toBe("revising");
  expect(derive(progress(tree("mastered", "mastered", "mastered"), "chem"))).toBe("mastered");
});

test("the outline is reading order with depth, not a bare list", () => {
  const list: Topic[] = [
    { id: "phys", parentId: null, name: "Physics", status: "todo", at: 1 },
    { id: "mech", parentId: "phys", name: "Mechanics", status: "todo", at: 2 },
    { id: "newton", parentId: "mech", name: "Laws", status: "todo", at: 3 },
    { id: "chem", parentId: null, name: "Chemistry", status: "todo", at: 4 },
  ];
  expect(outline(list).map((r) => `${r.depth}:${r.name}`)).toEqual([
    "0:Physics",
    "1:Mechanics",
    "2:Laws",
    "0:Chemistry",
  ]);
});

test("an orphan is left out rather than hanging the walk", () => {
  const list: Topic[] = [
    { id: "a", parentId: null, name: "A", status: "todo", at: 1 },
    { id: "lost", parentId: "gone", name: "Lost", status: "todo", at: 2 },
    { id: "loop", parentId: "loop", name: "Loop", status: "todo", at: 3 },
  ];
  expect(outline(list).map((r) => r.id)).toEqual(["a"]);
});
