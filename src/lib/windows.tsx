import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { XPIconName } from "@/components/XPIcon";
import type { StringKey } from "@/lib/i18n";

// The window manager. Everything the desktop can open is declared here once, so
// the Start menu, the desktop icons and the taskbar all launch and label the
// same set without three copies of the list drifting apart.

/** "shell" is the site itself: a window like any other, opening at its own size
 *  on the desktop rather than swallowing the screen. */
export type AppId =
  | "shell"
  | "browser"
  | "syllabus"
  | "cards"
  | "practice"
  | "progress"
  | "notes"
  | "journal"
  | "calendar"
  | "sounds"
  | "minesweeper"
  | "snake"
  | "display";

export type AppDef = {
  /** A translation key, not a name: the caption follows the tray's language. */
  title: StringKey;
  icon: XPIconName;
  w: number;
  h: number;
  /** Minimum a drag-resize will go to, and what a small screen still gets. */
  minW?: number;
  minH?: number;
};

export const APPS: Record<AppId, AppDef> = {
  shell: { title: "appBonk", icon: "folder-open", w: 1100, h: 720, minW: 320, minH: 320 },
  browser: { title: "appBrowser", icon: "globe", w: 880, h: 620, minW: 420, minH: 360 },
  syllabus: { title: "appSyllabus", icon: "folder-search", w: 720, h: 640, minW: 400, minH: 400 },
  cards: { title: "appCards", icon: "help", w: 640, h: 600, minW: 380, minH: 400 },
  practice: { title: "appPractice", icon: "help", w: 780, h: 660, minW: 400, minH: 420 },
  progress: { title: "appProgress", icon: "star", w: 820, h: 620, minW: 420, minH: 400 },
  minesweeper: { title: "appMinesweeper", icon: "star", w: 340, h: 430, minW: 300, minH: 380 },
  snake: { title: "appSnake", icon: "paint", w: 430, h: 540, minW: 340, minH: 420 },
  display: { title: "appDisplay", icon: "gear", w: 480, h: 520, minW: 340, minH: 400 },
  notes: { title: "appNotes", icon: "notepad", w: 760, h: 560, minW: 420, minH: 320 },
  journal: { title: "appJournal", icon: "journal", w: 620, h: 620, minW: 380, minH: 420 },
  calendar: { title: "appCalendar", icon: "calendar", w: 820, h: 560, minW: 460, minH: 380 },
  sounds: { title: "appSounds", icon: "music", w: 430, h: 448, minW: 320, minH: 380 },
};

export type WinState = {
  id: string;
  app: AppId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** Overrides the app's own name in the caption; the shell shows the route. */
  title?: string;
  /** Geometry to come back to when a maximised window is restored. */
  restore?: { x: number; y: number; w: number; h: number };
};

type Ctx = {
  windows: WinState[];
  open: (app: AppId) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
  resize: (id: string, w: number, h: number) => void;
  toggleMin: (id: string) => void;
  toggleMax: (id: string) => void;
  /** Renames a window's caption; the shell uses it to follow the route. */
  retitle: (id: string, title: string) => void;
  /** Taskbar's "show desktop": minimise everything, or put it all back. */
  toggleDesktop: () => void;
};

const WindowCtx = createContext<Ctx | null>(null);

/** Height of the taskbar; windows are never dragged underneath it. */
export const TASKBAR_H = 46;

let seq = 0;

/** Centred, viewport-fitted geometry for a window that is about to appear. Reads
 *  the DOM, so it is never called from inside a state updater. */
function spawn(def: AppDef, nth = 0) {
  const vw = window.innerWidth;
  const vh = window.innerHeight - TASKBAR_H;
  // Below the width where a floating window is a nuisance rather than a
  // feature, open filling the space instead.
  const small = vw < 760;
  const w = small ? vw - 12 : Math.min(def.w, vw - 40);
  const h = small ? vh - 12 : Math.min(def.h, vh - 40);
  const offset = (nth % 6) * 22;
  return {
    x: small ? 6 : Math.max(8, Math.round((vw - w) / 2) - 60 + offset),
    y: small ? 6 : Math.max(8, Math.round((vh - h) / 2) - 40 + offset),
    w,
    h,
  };
}

const shellWindow = (): WinState => ({
  id: "shell",
  app: "shell",
  // Zero until the client has a viewport to measure. The server has no window,
  // and hydrating with a guess would mismatch; Window renders nothing until the
  // mount effect below gives it a real size, so nothing flashes at 0x0.
  x: 0,
  y: 0,
  w: 0,
  h: 0,
  z: 10,
  minimized: false,
  maximized: false,
});

// Windows stack inside a fixed band that ends below the taskbar. The old
// counter simply incremented, so after ~35 raises a window's z passed the
// taskbar's 45 and it began to draw over it, which looked like a bug that
// only appeared once you had used the desktop for a while, and only when you
// dragged a window down. Renumbering on every raise keeps the whole stack
// inside Z_BASE..Z_BASE+n, and n is the number of open windows.
const Z_BASE = 10;
/** The taskbar's own z-index, from styles.css. Windows must stay under it. */
export const TASKBAR_Z = 45;

/** The stack, oldest first, with `id` moved to the top and renumbered. */
export function raise(ws: WinState[], id: string): WinState[] {
  const order = [...ws].sort((a, b) => a.z - b.z).filter((w) => w.id !== id);
  const target = ws.find((w) => w.id === id);
  if (target) order.push(target);
  const z = new Map(order.map((w, i) => [w.id, Z_BASE + i]));
  return ws.map((w) => ({
    ...w,
    z: z.get(w.id) ?? w.z,
    minimized: w.id === id ? false : w.minimized,
  }));
}

export function WindowProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<WinState[]>(() => [shellWindow()]);

  // The seeded shell has no geometry until there is a window to measure.
  useEffect(() => {
    setWindows((ws) => ws.map((w) => (w.w ? w : { ...w, ...spawn(APPS[w.app]) })));
  }, []);

  // A window dropped off the edge when the viewport shrank would be
  // unreachable, since the only way to move one is its own titlebar.
  useEffect(() => {
    const onResize = () =>
      setWindows((ws) =>
        ws.map((win) => ({
          ...win,
          x: Math.min(win.x, Math.max(0, window.innerWidth - 120)),
          y: Math.min(win.y, Math.max(0, window.innerHeight - TASKBAR_H - 40)),
        })),
      );
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const focus = useCallback((id: string) => {
    setWindows((ws) => raise(ws, id));
  }, []);

  const open = useCallback(
    (app: AppId) => {
      // Everything that reads the outside world happens here, before the updater,
      // so the updater itself is a pure function of the previous windows.
      const box = spawn(APPS[app], windows.length);
      const id = `w${++seq}`;

      setWindows((ws) => {
        // One instance each. A second launch raises the one already open, which
        // is what every taskbar in this era does with a running program.
        const existing = ws.find((win) => win.app === app);
        if (existing) return raise(ws, existing.id);
        const next: WinState[] = [
          ...ws,
          {
            ...(app === "shell" ? shellWindow() : { id, app, minimized: false, maximized: false }),
            ...box,
            z: 0,
          },
        ];
        return raise(next, id);
      });
    },
    [windows.length],
  );

  const close = useCallback((id: string) => setWindows((ws) => ws.filter((w) => w.id !== id)), []);
  const move = useCallback(
    (id: string, x: number, y: number) =>
      setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, x, y } : w))),
    [],
  );
  const resize = useCallback(
    (id: string, w: number, h: number) =>
      setWindows((ws) => ws.map((win) => (win.id === id ? { ...win, w, h } : win))),
    [],
  );
  const toggleMin = useCallback(
    (id: string) =>
      setWindows((ws) => ws.map((w) => (w.id === id ? { ...w, minimized: !w.minimized } : w))),
    [],
  );
  const retitle = useCallback(
    (id: string, title: string) =>
      setWindows((ws) => ws.map((w) => (w.id === id && w.title !== title ? { ...w, title } : w))),
    [],
  );

  const toggleMax = useCallback((id: string) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight - TASKBAR_H;
    setWindows((ws) =>
      ws.map((w) => {
        if (w.id !== id) return w;
        if (w.maximized) {
          // A window maximised before it was ever placed has no geometry
          // behind it, so a first restore needs somewhere sensible to land.
          const def = APPS[w.app];
          const back = w.restore ?? {
            w: Math.min(def.w, vw - 60),
            h: Math.min(def.h, vh - 50),
            x: Math.max(8, Math.round((vw - Math.min(def.w, vw - 60)) / 2)),
            y: Math.max(8, Math.round((vh - Math.min(def.h, vh - 50)) / 2)),
          };
          return { ...w, ...back, maximized: false };
        }
        return { ...w, restore: { x: w.x, y: w.y, w: w.w, h: w.h }, maximized: true };
      }),
    );
  }, []);

  // Show desktop: everything down, or everything back. The icons are always on
  // the desktop; the windows are simply covering them.
  const toggleDesktop = useCallback(() => {
    setWindows((ws) => {
      const anyUp = ws.some((w) => !w.minimized);
      return ws.map((w) => ({ ...w, minimized: anyUp }));
    });
  }, []);

  const value = useMemo(
    () => ({
      windows,
      open,
      close,
      focus,
      move,
      resize,
      toggleMin,
      toggleMax,
      retitle,
      toggleDesktop,
    }),
    [windows, open, close, focus, move, resize, toggleMin, toggleMax, retitle, toggleDesktop],
  );
  return <WindowCtx.Provider value={value}>{children}</WindowCtx.Provider>;
}

/** Null outside the provider, so the taskbar can render on pages without it. */
export function useWindowsOptional() {
  return useContext(WindowCtx);
}

export function useWindows() {
  const ctx = useContext(WindowCtx);
  if (!ctx) throw new Error("useWindows must be used inside a WindowProvider");
  return ctx;
}
