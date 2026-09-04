import { expect, test } from "bun:test";
import { raise, TASKBAR_Z } from "@/lib/windows";
import type { WinState } from "@/lib/windows";

const win = (id: string, z: number): WinState => ({
  id,
  app: "notes",
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  z,
  minimized: false,
  maximized: false,
});

test("raising puts a window on top without leaving a gap", () => {
  const ws = [win("a", 10), win("b", 11), win("c", 12)];
  const z = (s: WinState[], id: string) => s.find((w) => w.id === id)!.z;
  const next = raise(ws, "a");
  expect(z(next, "a")).toBe(12);
  expect([z(next, "b"), z(next, "c")].sort()).toEqual([10, 11]);
});

test("raising un-minimises only the window raised", () => {
  const ws = [
    { ...win("a", 10), minimized: true },
    { ...win("b", 11), minimized: true },
  ];
  const next = raise(ws, "a");
  expect(next.find((w) => w.id === "a")!.minimized).toBe(false);
  expect(next.find((w) => w.id === "b")!.minimized).toBe(true);
});

// The bug this replaced: z simply incremented on every raise, so after enough
// clicks a window's z passed the taskbar's and it drew over it. Renumbering
// keeps the whole stack inside a band no wider than the number of windows.
test("no amount of raising lifts a window over the taskbar", () => {
  let ws = Array.from({ length: 9 }, (_, i) => win(`w${i}`, 10 + i));
  for (let n = 0; n < 500; n++) ws = raise(ws, `w${n % ws.length}`);
  const top = Math.max(...ws.map((w) => w.z));
  expect(top).toBeLessThan(TASKBAR_Z);
  expect(top).toBe(10 + ws.length - 1);
});
