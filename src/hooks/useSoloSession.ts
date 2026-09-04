import { useSyncExternalStore } from "react";

// Persistent solo-session store. Survives route changes, tab switches,
// and page reloads by mirroring to sessionStorage.
export type SoloMode = "pomodoro" | "stopwatch" | "custom" | "interval";
export type SoloState = "idle" | "focus" | "break";

export type SoloSession = {
  mode: SoloMode;
  focusMin: number;
  breakMin: number;
  targetCycles: number;
  currentCycle: number;
  state: SoloState;
  startedAt: string | null;
  pausedAt: string | null;
  // Server-issued focus session id for the current focus block, so
  // completion awards are tied to a real elapsed timer server-side.
  focusSessionId: string | null;
};

const STORAGE_KEY = "wd.solo.session.v1";

const DEFAULT: SoloSession = {
  mode: "pomodoro",
  focusMin: 25,
  breakMin: 5,
  targetCycles: 4,
  currentCycle: 1,
  state: "idle",
  startedAt: null,
  pausedAt: null,
  focusSessionId: null,
};

function read(): SoloSession {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<SoloSession>) };
  } catch {
    return DEFAULT;
  }
}

let current: SoloSession = typeof window === "undefined" ? DEFAULT : read();
const listeners = new Set<() => void>();

function emit() {
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot() {
  return current;
}
function getServerSnapshot() {
  return DEFAULT;
}

export function setSoloSession(
  patch: Partial<SoloSession> | ((s: SoloSession) => Partial<SoloSession>),
) {
  const next = typeof patch === "function" ? patch(current) : patch;
  current = { ...current, ...next };
  emit();
}

export function resetSoloSession() {
  current = { ...DEFAULT };
  emit();
}

export function useSoloSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Derived helpers - safe to call outside components.
export function getSoloRemainingSec(s: SoloSession): number {
  if (s.state === "idle" || !s.startedAt) return 0;
  const durationSec = (s.state === "break" ? s.breakMin : s.focusMin) * 60;
  const reference = s.pausedAt ? new Date(s.pausedAt).getTime() : Date.now();
  const elapsed = (reference - new Date(s.startedAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(durationSec - elapsed));
}

export function isSoloActive(s: SoloSession): boolean {
  return s.state !== "idle" && s.mode !== "stopwatch";
}
