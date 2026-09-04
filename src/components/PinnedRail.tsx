import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useActiveBonk } from "@/hooks/useActiveBonk";
import { useAuth } from "@/hooks/useAuth";
import { useTodos } from "@/hooks/useTodos";
import { getSoloRemainingSec, isSoloActive, useSoloSession } from "@/hooks/useSoloSession";
import { formatMMSS } from "@/hooks/useTimer";
import { useT } from "@/lib/i18n";
import { BEDS, ambient, useAmbient } from "@/lib/ambient";
import { useWindowsOptional } from "@/lib/windows";
import { playSound } from "@/lib/sound";
import { XPIcon } from "@/components/XPIcon";

// The rail: the things you want in sight while you are doing something else.
// It sits on one edge rather than in the taskbar, because a taskbar button is
// somewhere you go and this is something you watch.
//
// Everything here is a *view* of state that lives elsewhere, the room you are
// sitting in, the solo session, your to-do list, the ambient engine, so the
// rail can be collapsed, or the window it mirrors closed, without touching
// what is running. Each card hides itself on the screen it points at, because
// a shortcut back to where you already are is just clutter.

const RAIL_KEY = "wd.rail";

export function PinnedRail() {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const session = useSoloSession();
  const mix = useAmbient();
  const { user } = useAuth();
  const bonk = useActiveBonk(user?.id);
  const { todos, toggle } = useTodos(user?.id);
  const wm = useWindowsOptional();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [, tick] = useState(0);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(RAIL_KEY) !== "0");
    } catch {
      /* private mode: it just starts open */
    }
  }, []);

  // One ticker for the rail, whether it is counting a block or a sleep timer.
  const timerLive = isSoloActive(session) && !session.pausedAt;
  const sleepLive = mix.fadeAt != null;
  useEffect(() => {
    if (!timerLive && !sleepLive) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [timerLive, sleepLive]);

  const showTimer = isSoloActive(session) && pathname !== "/solo";
  const live = BEDS.filter((b) => mix.levels[b.id] > 0);
  const showSound = live.length > 0;
  // The room you are sitting in, unless you are already looking at it.
  const showBonk = bonk != null && !pathname.startsWith(`/bonks/${bonk.id}`);
  // Only what is still to do, and only the first few: the rail is a reminder,
  // not the list. The full one is a click away on either screen it belongs to.
  const pending = todos.filter((x) => !x.done).slice(0, 4);
  const showTodos = user != null && pending.length > 0 && pathname !== "/solo";
  if (!showTimer && !showSound && !showBonk && !showTodos) return null;

  const set = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(RAIL_KEY, v ? "1" : "0");
    } catch {
      /* private mode: it just will not be remembered */
    }
  };

  if (!open) {
    return (
      <button
        className="rail-tab"
        onClick={() => set(true)}
        title={t("railShow")}
        aria-label={t("railShow")}
      >
        <span className={mix.playing && showSound ? "rail-dot is-live" : "rail-dot"} aria-hidden />◄
      </button>
    );
  }

  return (
    <aside className="rail" aria-label={t("railTitle")}>
      <div className="rail-head">
        <span className="label-caps">{t("railTitle")}</span>
        <button onClick={() => set(false)} title={t("railHide")} aria-label={t("railHide")}>
          ✕
        </button>
      </div>

      {showBonk && bonk && (
        <Link to="/bonks/$id" params={{ id: bonk.id }} className="rail-card rail-bonk">
          <span className="rail-dot is-live" aria-hidden />
          <span className="rail-label">{bonk.name}</span>
          <span className="rail-go">{t("railResume")}</span>
        </Link>
      )}

      {showTimer && (
        <Link to="/solo" className="rail-card rail-timer">
          <span className={`rail-dot ${session.pausedAt ? "" : "is-live"}`} aria-hidden />
          <span className="rail-label">
            {session.state === "break" ? t("breakLabel") : t("focus")}
          </span>
          <span className="rail-time">{formatMMSS(getSoloRemainingSec(session))}</span>
        </Link>
      )}

      {showTodos && (
        <div className="rail-card rail-todos">
          <div className="rail-todos-head">
            <span className="label-caps">{t("todo")}</span>
            <Link to="/solo">{t("railOpenList")}</Link>
          </div>
          <ul>
            {pending.map((todo) => (
              <li key={todo.id}>
                <button
                  onClick={() => {
                    void toggle(todo.id, true);
                    playSound("click");
                  }}
                  aria-label={t("markDone")}
                >
                  <span className="rail-box" aria-hidden />
                  <span className="rail-todo-text">{todo.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showSound && (
        <div className="rail-card rail-sound">
          <button
            className="rail-play"
            onClick={() => {
              ambient.toggle();
              playSound("click");
            }}
            aria-label={mix.playing ? t("pause") : t("startGame")}
          >
            {mix.playing ? "❚❚" : "▶"}
          </button>
          <button
            className="rail-mix"
            onClick={() => wm?.open("sounds")}
            title={t("soundsOpenMixer")}
          >
            <span className="rail-label">{live.map((b) => t(b.label)).join(" + ")}</span>
            {mix.fadeAt != null && (
              <span className="rail-sleep">
                {t("soundsSleep")} {formatMMSS(ambient.sleepLeft() ?? 0)}
              </span>
            )}
          </button>
          <label className="rail-vol">
            <XPIcon name="speaker" size={12} />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(mix.master * 100)}
              onChange={(e) => ambient.setMaster(+e.target.value / 100)}
              aria-label={t("soundsMaster")}
            />
          </label>
        </div>
      )}
    </aside>
  );
}
