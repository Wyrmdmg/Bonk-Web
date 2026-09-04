import { useCallback, useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sound";
import { useT } from "@/lib/i18n";

// Snake, on a 20x20 board. Arrows or WASD; the pad underneath is for touch.

const N = 20;
const START = [{ x: 10, y: 10 }];
type P = { x: number; y: number };
const same = (a: P, b: P) => a.x === b.x && a.y === b.y;

const SPEEDS = { easy: 170, normal: 120, fast: 80 } as const;
type Speed = keyof typeof SPEEDS;

export function Snake() {
  const { t } = useT();
  const [body, setBody] = useState<P[]>(START);
  const [food, setFood] = useState<P>({ x: 5, y: 5 });
  const [dead, setDead] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [best, setBest] = useState(0);
  // The queue absorbs two taps inside one tick, so a quick right-then-up is not
  // swallowed the way it would be if direction were a single value.
  const dir = useRef<P>({ x: 1, y: 0 });
  const queued = useRef<P[]>([]);

  // The board lives in refs and the tick computes the whole next state before
  // touching React. Doing this inside a setBody updater meant setFood, setDead
  // and a sound effect all fired from a function React is free to run twice.
  const bodyRef = useRef<P[]>(body);
  const foodRef = useRef<P>(food);
  bodyRef.current = body;
  foodRef.current = food;

  const place = useCallback((taken: P[]): P => {
    const free: P[] = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (!taken.some((s) => s.x === x && s.y === y)) free.push({ x, y });
    return free[Math.floor(Math.random() * free.length)] ?? { x: 0, y: 0 };
  }, []);

  const reset = useCallback(() => {
    const spot = place(START);
    bodyRef.current = START;
    foodRef.current = spot;
    setBody(START);
    setFood(spot);
    setDead(false);
    setRunning(true);
    dir.current = { x: 1, y: 0 };
    queued.current = [];
  }, [place]);

  const turn = useCallback((d: P) => {
    const last = queued.current[queued.current.length - 1] ?? dir.current;
    if (last.x === -d.x && last.y === -d.y) return; // no reversing into yourself
    if (last.x === d.x && last.y === d.y) return;
    queued.current.push(d);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, P> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 },
        s: { x: 0, y: 1 },
        a: { x: -1, y: 0 },
        d: { x: 1, y: 0 },
      };
      const d = map[e.key] ?? map[e.key.toLowerCase()];
      if (!d) return;
      e.preventDefault();
      turn(d);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);

  useEffect(() => {
    if (!running || dead) return;
    const id = window.setInterval(() => {
      if (queued.current.length) dir.current = queued.current.shift()!;
      const prev = bodyRef.current;
      const head = { x: prev[0].x + dir.current.x, y: prev[0].y + dir.current.y };
      const hitWall = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N;
      // The tail square frees up this tick unless we just ate, so moving into
      // it is not a collision.
      const eating = same(head, foodRef.current);
      const trunk = eating ? prev : prev.slice(0, -1);
      if (hitWall || trunk.some((s) => same(s, head))) {
        setDead(true);
        setRunning(false);
        playSound("error");
        return;
      }
      const next = [head, ...trunk];
      bodyRef.current = next;
      setBody(next);
      if (eating) {
        const spot = place(next);
        foodRef.current = spot;
        setFood(spot);
        setBest((b) => Math.max(b, next.length - 1));
        playSound("ding");
      }
    }, SPEEDS[speed]);
    return () => window.clearInterval(id);
  }, [running, dead, speed, place]);

  const score = body.length - 1;

  return (
    <div className="sn">
      <div className="sn-head">
        <span>
          {t("score")} <b>{score}</b>
        </span>
        <span>
          {t("best")} <b>{Math.max(best, score)}</b>
        </span>
        <span className="sn-speeds">
          {(Object.keys(SPEEDS) as Speed[]).map((s) => (
            <button key={s} className={speed === s ? "is-on" : ""} onClick={() => setSpeed(s)}>
              {t(s)}
            </button>
          ))}
        </span>
      </div>

      <div className="sn-board" style={{ ["--n" as string]: N }}>
        {body.map((s, i) => (
          <span
            key={i}
            className={`sn-seg ${i === 0 ? "is-head" : ""}`}
            style={{ left: `calc(${s.x} * 100% / ${N})`, top: `calc(${s.y} * 100% / ${N})` }}
          />
        ))}
        <span
          className="sn-food"
          style={{ left: `calc(${food.x} * 100% / ${N})`, top: `calc(${food.y} * 100% / ${N})` }}
        />
        {(!running || dead) && (
          <div className="sn-overlay">
            <p>{dead ? `${t("deadYouReached")} ${score}.` : t("steerHint")}</p>
            <button className="btn-base btn-primary" onClick={reset}>
              {dead ? t("playAgain") : t("startGame")}
            </button>
          </div>
        )}
      </div>

      <div className="sn-pad" aria-hidden>
        <button onClick={() => turn({ x: 0, y: -1 })}>▲</button>
        <span>
          <button onClick={() => turn({ x: -1, y: 0 })}>◄</button>
          <button onClick={() => turn({ x: 1, y: 0 })}>►</button>
        </span>
        <button onClick={() => turn({ x: 0, y: 1 })}>▼</button>
      </div>
    </div>
  );
}
