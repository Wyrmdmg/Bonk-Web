import { useSyncExternalStore } from "react";
import type { StringKey } from "@/lib/i18n";

// The ambient mixer. Several beds play at once, each with its own level, the
// way a study-sound app works, one rain track on its own is a ringtone; rain
// under a fire is a room.
//
// The engine lives at module scope, not in a component, because closing the
// Sounds window must not stop the sound. The window and the pinned player are
// both just views onto this; either can be gone while the audio keeps running.
//
// Every bed is a seamless loop: the file's tail is crossfaded onto its head at
// build time, so `loop` has no seam to expose. They are also loudness-matched
// (EBU R128, -23 LUFS), so a slider at 50% means the same thing on all six.

export type BedId = "rain" | "campfire" | "fireplace" | "brown" | "pink" | "white";

export type Bed = { id: BedId; label: StringKey; src: string; icon: string };

export const BEDS: Bed[] = [
  { id: "rain", label: "bedRain", src: "/ambient/rain.mp3", icon: "☂" },
  { id: "campfire", label: "bedCampfire", src: "/ambient/campfire.mp3", icon: "🔥" },
  { id: "fireplace", label: "bedFireplace", src: "/ambient/fireplace.mp3", icon: "🪵" },
  { id: "brown", label: "bedBrown", src: "/ambient/brown.mp3", icon: "▓" },
  { id: "pink", label: "bedPink", src: "/ambient/pink.mp3", icon: "▒" },
  { id: "white", label: "bedWhite", src: "/ambient/white.mp3", icon: "░" },
];

export type MixState = {
  /** Level per bed, 0..1. A bed at 0 is off and holds no audio element. */
  levels: Record<BedId, number>;
  master: number;
  playing: boolean;
  /** Minutes until auto-stop, or null for no timer. */
  fadeAt: number | null;
};

const KEY = "wd.ambient";
const DEFAULT: MixState = {
  levels: { rain: 0, campfire: 0, fireplace: 0, brown: 0, pink: 0, white: 0 },
  master: 0.7,
  playing: false,
  fadeAt: null,
};

function read(): MixState {
  if (typeof localStorage === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<MixState>;
    return {
      levels: { ...DEFAULT.levels, ...(p.levels ?? {}) },
      master: typeof p.master === "number" ? clamp(p.master) : DEFAULT.master,
      // Never restore mid-play: a page that starts making noise on load is a
      // page people close. The mix is remembered, the decision to hear it is not.
      playing: false,
      fadeAt: null,
    };
  } catch {
    return DEFAULT;
  }
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

let state: MixState = read();
const listeners = new Set<() => void>();
const els = new Map<BedId, HTMLAudioElement>();
let stopAt: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ levels: state.levels, master: state.master }));
  } catch {
    /* private mode: the mix just will not be remembered */
  }
  for (const l of listeners) l();
}

/** One element per audible bed, created on demand and dropped when silenced. */
function sync() {
  for (const bed of BEDS) {
    const level = state.levels[bed.id];
    const want = state.playing && level > 0;
    let el = els.get(bed.id);
    if (want && !el) {
      el = new Audio(bed.src);
      el.loop = true;
      el.preload = "auto";
      els.set(bed.id, el);
    }
    if (!el) continue;
    el.volume = clamp(level * state.master);
    if (want) {
      // A browser that refuses playback leaves the bed silent rather than
      // throwing; the first click anywhere satisfies the gesture requirement.
      void el.play().catch(() => {});
    } else {
      el.pause();
      if (!state.playing) el.currentTime = 0;
      if (level === 0) {
        els.delete(bed.id);
      }
    }
  }
}

function set(next: Partial<MixState>) {
  state = { ...state, ...next };
  sync();
  emit();
}

export const ambient = {
  get: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  setLevel(id: BedId, level: number) {
    const levels = { ...state.levels, [id]: clamp(level) };
    // Turning a bed up is the same intention as pressing play. This has to hold
    // even when the *saved* mix already had beds above zero: on a reload the
    // levels come back but playing deliberately does not, and an earlier
    // version asked "is anything already audible?" here, which was false only
    // on a first-ever visit, so after any reload clicking a sound silently did
    // nothing and you had to find the play button.
    const playing = state.playing || level > 0;
    set({ levels, playing });
  },
  toggleBed(id: BedId) {
    const on = state.levels[id] > 0;
    ambient.setLevel(id, on ? 0 : 0.6);
  },
  setMaster(master: number) {
    set({ master: clamp(master) });
  },
  toggle() {
    // Pressing play with everything at zero should make a sound, not nothing.
    if (!state.playing && !anyAudible()) {
      set({ levels: { ...state.levels, rain: 0.6 }, playing: true });
      return;
    }
    set({ playing: !state.playing });
  },
  stop() {
    set({ playing: false });
  },
  /** Auto-stop after `mins`, or null to cancel. Survives the window closing. */
  setSleep(mins: number | null) {
    if (timer) clearInterval(timer);
    timer = null;
    stopAt = mins == null ? null : Date.now() + mins * 60_000;
    set({ fadeAt: stopAt });
    if (stopAt == null) return;
    timer = setInterval(() => {
      if (stopAt == null) return;
      if (Date.now() >= stopAt) {
        stopAt = null;
        if (timer) clearInterval(timer);
        timer = null;
        set({ playing: false, fadeAt: null });
      } else {
        for (const l of listeners) l();
      }
    }, 1000);
  },
  /** Seconds left on the sleep timer, or null when none is set. */
  sleepLeft() {
    return stopAt == null ? null : Math.max(0, Math.ceil((stopAt - Date.now()) / 1000));
  },
};

const anyAudible = () => Object.values(state.levels).some((v) => v > 0);

/** Everything that renders the mixer reads it through this. */
export function useAmbient() {
  return useSyncExternalStore(
    ambient.subscribe,
    ambient.get,
    () => DEFAULT, // the server has no audio and no localStorage
  );
}
