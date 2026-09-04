import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { APPS, TASKBAR_H, useWindows, type WinState } from "@/lib/windows";
import { XPIcon } from "@/components/XPIcon";
import { playSound } from "@/lib/sound";
import { useT } from "@/lib/i18n";

// A window you can actually pick up, and that arrives and leaves rather than
// blinking in and out.

const EXIT_MS = 170;
const MAX_MS = 200;

function useDrag(
  onMove: (dx: number, dy: number) => void,
  onDone?: () => void,
): (e: React.PointerEvent) => void {
  const from = useRef<{ x: number; y: number } | null>(null);
  return useCallback(
    (e: React.PointerEvent) => {
      // Left button only, and never from a control sitting on the drag handle.
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("button")) return;
      const el = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;
      from.current = { x: e.clientX, y: e.clientY };

      // The listeners go on the window, not the handle. Pointer capture would
      // let the handle keep receiving moves on its own, but it throws when the
      // pointer is not capturable, so capture is a bonus here, not the
      // mechanism, and a failure cannot abort the rest of this function.
      const onPointerMove = (ev: PointerEvent) => {
        if (!from.current) return;
        onMove(ev.clientX - from.current.x, ev.clientY - from.current.y);
      };
      const stop = () => {
        from.current = null;
        try {
          el.releasePointerCapture(pointerId);
        } catch {
          /* never captured */
        }
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        onDone?.();
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* the window listeners above carry the drag regardless */
      }
      e.preventDefault();
    },
    [onMove, onDone],
  );
}

export function Window({
  win,
  active,
  children,
}: {
  win: WinState;
  active: boolean;
  children: ReactNode;
}) {
  const { close, focus, move, resize, toggleMin, toggleMax } = useWindows();
  const { t } = useT();
  const def = APPS[win.app];
  const title = win.title ?? t(def.title);
  const start = useRef({ x: 0, y: 0, w: 0, h: 0 });
  // The node has to outlive the request to remove it, or there is nothing left
  // on screen to animate out.
  const [exit, setExit] = useState<null | "close" | "min">(null);
  const [sizing, setSizing] = useState(false);

  const onTitleDown = useDrag((dx, dy) => {
    if (win.maximized) return;
    const maxX = window.innerWidth - 90;
    const maxY = window.innerHeight - TASKBAR_H - 28;
    move(
      win.id,
      Math.min(maxX, Math.max(-win.w + 90, start.current.x + dx)),
      // Never above the top edge or under the taskbar: the caption is the only
      // handle, so a window that loses it is gone for good.
      Math.min(maxY, Math.max(0, start.current.y + dy)),
    );
  });

  const onGripDown = useDrag((dx, dy) => {
    resize(
      win.id,
      Math.max(def.minW ?? 260, Math.min(window.innerWidth - win.x, start.current.w + dx)),
      Math.max(
        def.minH ?? 200,
        Math.min(window.innerHeight - TASKBAR_H - win.y, start.current.h + dy),
      ),
    );
  });

  // Snapshot the geometry a drag starts from, so the deltas do not compound.
  const snapshot = () => {
    start.current = { x: win.x, y: win.y, w: win.w, h: win.h };
  };

  // Mount only, so a restore does not chirp a second time.
  useEffect(() => {
    playSound("open");
  }, []);

  // Belt and braces: anything that clears `minimized` from elsewhere (the
  // taskbar, show desktop) must not find a stale exit animation waiting.
  useEffect(() => {
    if (!win.minimized && exit === "min") setExit(null);
  }, [win.minimized, exit]);

  // Size changes are transitioned; drags are not, or the window lags the cursor.
  const animateSize = () => {
    setSizing(true);
    window.setTimeout(() => setSizing(false), MAX_MS);
  };

  const leave = (kind: "close" | "min") => {
    if (exit) return;
    playSound("close");
    setExit(kind);
    window.setTimeout(() => {
      if (kind === "close") {
        close(win.id);
        return;
      }
      // Both in the same tick: minimised with no exit class means the node is
      // dropped, so it never flashes back at full size on the way out. Leaving
      // the class on was what made a restored window come back scaled down,
      // since the animation's transform was still applied to it.
      toggleMin(win.id);
      setExit(null);
    }, EXIT_MS);
  };

  if (win.minimized && !exit) return null;
  // Seeded on the server with no geometry: there is nothing to draw until the
  // provider's mount effect has measured the viewport for it.
  if (!win.maximized && !win.w) return null;

  return (
    <div
      className={[
        "xp-window",
        active ? "is-active" : "",
        win.maximized ? "is-max" : "",
        sizing ? "is-sizing" : "",
        exit ? `is-${exit}` : "is-opening",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        win.maximized
          ? { zIndex: win.z }
          : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }
      }
      onPointerDown={() => focus(win.id)}
      role="dialog"
      aria-label={title}
    >
      <div
        className="xp-caption"
        onPointerDown={(e) => {
          snapshot();
          onTitleDown(e);
        }}
        onDoubleClick={() => {
          animateSize();
          toggleMax(win.id);
        }}
      >
        <XPIcon name={def.icon} size={16} />
        <span className="xp-caption-title">{title}</span>
        <span className="xp-caption-buttons">
          <button onClick={() => leave("min")} aria-label={t("minimise")} className="cap-btn">
            <i className="cap-min" />
          </button>
          <button
            onClick={() => {
              animateSize();
              toggleMax(win.id);
            }}
            aria-label={win.maximized ? t("restore") : t("maximise")}
            className="cap-btn"
          >
            <i className={win.maximized ? "cap-restore" : "cap-max"} />
          </button>
          <button
            onClick={() => leave("close")}
            aria-label={t("close")}
            className="cap-btn cap-btn-close"
          >
            <i className="cap-x" />
          </button>
        </span>
      </div>

      <div className="xp-body">{children}</div>

      {!win.maximized && (
        <span
          className="xp-grip"
          aria-hidden
          onPointerDown={(e) => {
            snapshot();
            onGripDown(e);
          }}
        />
      )}
    </div>
  );
}
