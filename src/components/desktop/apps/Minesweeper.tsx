import { useCallback, useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound";
import { useT } from "@/lib/i18n";

// Minesweeper. Right click flags; the flag toggle next to the smiley is there
// because a touch screen has no second button.

type Level = "beginner" | "intermediate" | "expert";
const LEVELS: Record<Level, { w: number; h: number; mines: number }> = {
  beginner: { w: 9, h: 9, mines: 10 },
  intermediate: { w: 16, h: 16, mines: 40 },
  expert: { w: 30, h: 16, mines: 99 },
};

type Cell = { mine: boolean; near: number; open: boolean; flag: boolean };

/** The first click is never a mine, so the board is laid after it. */
function build(w: number, h: number, mines: number, safe: number): Cell[] {
  const cells: Cell[] = Array.from({ length: w * h }, () => ({
    mine: false,
    near: 0,
    open: false,
    flag: false,
  }));
  const forbidden = new Set([safe, ...neighbours(safe, w, h)]);
  const spots: number[] = [];
  for (let i = 0; i < w * h; i++) if (!forbidden.has(i)) spots.push(i);
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  for (const i of spots.slice(0, mines)) cells[i].mine = true;
  for (let i = 0; i < cells.length; i++)
    cells[i].near = neighbours(i, w, h).filter((n) => cells[n].mine).length;
  return cells;
}

function neighbours(i: number, w: number, h: number): number[] {
  const x = i % w;
  const y = Math.floor(i / w);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) out.push(ny * w + nx);
    }
  return out;
}

export function Minesweeper() {
  const { t } = useT();
  const [level, setLevel] = useState<Level>("beginner");
  const { w, h, mines } = LEVELS[level];
  const [cells, setCells] = useState<Cell[] | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "won" | "lost">("idle");
  const [flagMode, setFlagMode] = useState(false);
  const [secs, setSecs] = useState(0);
  const started = useRef<number | null>(null);

  const reset = useCallback(() => {
    setCells(null);
    setState("idle");
    setSecs(0);
    started.current = null;
  }, []);

  useEffect(reset, [level, reset]);

  useEffect(() => {
    if (state !== "playing") return;
    const id = window.setInterval(() => {
      if (started.current)
        setSecs(Math.min(999, Math.floor((Date.now() - started.current) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [state]);

  const flags = cells?.filter((c) => c.flag).length ?? 0;

  const open = (i: number) => {
    if (state === "won" || state === "lost") return;
    let board = cells;
    if (!board) {
      board = build(w, h, mines, i);
      started.current = Date.now();
      setState("playing");
    }
    if (board[i].flag || board[i].open) return;

    const next = board.map((c) => ({ ...c }));
    if (next[i].mine) {
      next.forEach((c) => {
        if (c.mine) c.open = true;
      });
      setCells(next);
      setState("lost");
      playSound("error");
      return;
    }
    // Flood the zero region, iteratively: a 30x16 board can recurse deep.
    const queue = [i];
    while (queue.length) {
      const cur = queue.pop()!;
      if (next[cur].open || next[cur].flag) continue;
      next[cur].open = true;
      if (next[cur].near === 0) queue.push(...neighbours(cur, w, h));
    }
    setCells(next);
    if (next.every((c) => c.mine || c.open)) {
      setState("won");
      playSound("ding");
    }
  };

  const flag = (i: number) => {
    if (!cells || state === "won" || state === "lost" || cells[i].open) return;
    setCells(cells.map((c, n) => (n === i ? { ...c, flag: !c.flag } : c)));
  };

  const face = state === "lost" ? "✕" : state === "won" ? "★" : "☺";

  return (
    <div className="ms">
      <div className="ms-menu">
        {(Object.keys(LEVELS) as Level[]).map((l) => (
          <button key={l} className={level === l ? "is-on" : ""} onClick={() => setLevel(l)}>
            {t(l)}
          </button>
        ))}
      </div>
      <div className="ms-head">
        <span className="ms-led">{String(Math.max(0, mines - flags)).padStart(3, "0")}</span>
        <div className="ms-controls">
          <button className="ms-face" onClick={reset} aria-label={t("newGame")}>
            {face}
          </button>
          <button
            className={`ms-flagmode ${flagMode ? "is-on" : ""}`}
            onClick={() => setFlagMode((v) => !v)}
            aria-pressed={flagMode}
            title={t("tapToFlag")}
          >
            ⚑
          </button>
        </div>
        <span className="ms-led">{String(secs).padStart(3, "0")}</span>
      </div>
      <div className="ms-grid" style={{ gridTemplateColumns: `repeat(${w}, 18px)` }}>
        {Array.from({ length: w * h }, (_, i) => {
          const c = cells?.[i];
          const shown = c?.open;
          return (
            <button
              key={i}
              className={`ms-cell ${shown ? "is-open" : ""} ${c?.mine && shown ? "is-mine" : ""}`}
              data-n={shown && c && c.near > 0 ? c.near : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                flag(i);
              }}
              onClick={() => (flagMode ? flag(i) : open(i))}
            >
              {c?.flag && !shown
                ? "⚑"
                : shown && c?.mine
                  ? "✸"
                  : shown && c!.near > 0
                    ? c!.near
                    : ""}
            </button>
          );
        })}
      </div>
      <div className="ms-foot">
        {state === "won"
          ? `${t("sweptIn")} ${secs}s.`
          : state === "lost"
            ? t("boomTryAgain")
            : t("digFlagHint")}
      </div>
    </div>
  );
}
