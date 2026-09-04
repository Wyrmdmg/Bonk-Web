import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import breakStartUrl from "@/assets/break-start.wav";
import breakEndUrl from "@/assets/break-end.wav";
import alarmClassicUrl from "@/assets/alarm-classic.wav";
import alarmDigitalUrl from "@/assets/alarm-digital.wav";

export type AlarmSoundId = "breakStart" | "breakEnd" | "classic" | "digital";

export const ALARM_SOUNDS: { id: AlarmSoundId; name: string; url: string }[] = [
  { id: "breakStart", name: "Chime (default start)", url: breakStartUrl },
  { id: "breakEnd", name: "Ding (default end)", url: breakEndUrl },
  { id: "classic", name: "Classic Alarm", url: alarmClassicUrl },
  { id: "digital", name: "Digital Buzzer", url: alarmDigitalUrl },
];

export type AlarmSettings = {
  enabled: boolean;
  muted: boolean;
  volume: number;
  breakStartSound: AlarmSoundId;
  breakEndSound: AlarmSoundId;
};
// The two older keys this replaces were named after a person, and carrying
// them would have kept that name in the shipped bundle. Anyone who had saved
// alarm settings gets the defaults back once, which is a second of clicking.
const KEY = "bonk.alarm.v3";
// The break sounds, not the harsher classic/digital alarms: those two are
// literally the files named break-start.wav and break-end.wav and labelled
// "default" in the picker. Anyone who wants the buzzer can still choose it.
const DEFAULTS: AlarmSettings = {
  enabled: true,
  muted: false,
  volume: 0.6,
  breakStartSound: "breakStart",
  breakEndSound: "breakEnd",
};

export function normalizeAlarmSettings(
  p: Partial<AlarmSettings> | null | undefined,
): AlarmSettings {
  if (!p) return DEFAULTS;
  const validId = (v: unknown, fallback: AlarmSoundId): AlarmSoundId =>
    ALARM_SOUNDS.some((s) => s.id === v) ? (v as AlarmSoundId) : fallback;
  return {
    enabled: p.enabled ?? DEFAULTS.enabled,
    muted: p.muted ?? DEFAULTS.muted,
    volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : DEFAULTS.volume,
    breakStartSound: validId(p.breakStartSound, DEFAULTS.breakStartSound),
    breakEndSound: validId(p.breakEndSound, DEFAULTS.breakEndSound),
  };
}

function read(): AlarmSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return normalizeAlarmSettings(raw ? (JSON.parse(raw) as Partial<AlarmSettings>) : null);
  } catch {
    return DEFAULTS;
  }
}

// One shared settings value for every useAlarm() caller. The panel that
// changes a sound and the timer that plays it are different components, and
// while each held its own useState copy read once at mount, changing the
// sound in the panel left the running timer firing whatever it had captured
// earlier - usually the default. Same store shape as useSoloSession.
let settingsState: AlarmSettings = typeof window === "undefined" ? DEFAULTS : read();
const settingsListeners = new Set<() => void>();

function subscribeSettings(l: () => void) {
  settingsListeners.add(l);
  return () => {
    settingsListeners.delete(l);
  };
}

export function getAlarmSettings(): AlarmSettings {
  return settingsState;
}

export function setAlarmSettings(patch: Partial<AlarmSettings>) {
  settingsState = { ...settingsState, ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settingsState));
    } catch {
      /* ignore */
    }
  }
  applyLiveAlarmSettings(settingsState);
  settingsListeners.forEach((l) => l());
}

// Autoplay policies block Audio.play() without a prior user gesture. We
// warm every alarm file inside the first user interaction so subsequent
// realtime-triggered alarms play reliably in Chrome/Safari.
let audioUnlocked = false;
const unlockListeners = new Set<(v: boolean) => void>();
function setUnlocked(v: boolean) {
  audioUnlocked = v;
  unlockListeners.forEach((cb) => {
    try {
      cb(v);
    } catch {
      /* ignore */
    }
  });
}
const cache = new Map<string, HTMLAudioElement>();

// HTMLAudioElement.volume is linear amplitude, but loudness is perceived
// roughly logarithmically, so a slider at 0.5 only sounds ~6dB down and
// feels like it did nothing. Curving it makes the middle of the slider
// actually sound like half volume.
function perceptual(v: number): number {
  const clamped = Math.min(1, Math.max(0, v));
  return clamped ** 2.5;
}

// The cache holds one warm element per file, used ONLY to preload bytes and
// to satisfy the browser's autoplay unlock. Playback never touches these -
// priming mutes them and restores volume in an async callback, so an alarm
// firing mid-prime used to play silent or get its volume stomped.
function getAudio(url: string): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  let a = cache.get(url);
  if (!a) {
    a = new Audio(url);
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    cache.set(url, a);
  }
  return a;
}

function primeAllSounds(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const attempts = ALARM_SOUNDS.map((s) => {
    const a = getAudio(s.url);
    if (!a) return Promise.resolve(false);
    const prevMuted = a.muted;
    const prevVol = a.volume;
    a.muted = true;
    a.volume = 0;
    try {
      const p = a.play();
      if (p && typeof p.then === "function") {
        return p
          .then(() => {
            a.pause();
            a.currentTime = 0;
            a.muted = prevMuted;
            a.volume = prevVol;
            return true;
          })
          .catch(() => {
            a.muted = prevMuted;
            a.volume = prevVol;
            return false;
          });
      }
      return Promise.resolve(true);
    } catch {
      a.muted = prevMuted;
      a.volume = prevVol;
      return Promise.resolve(false);
    }
  });
  return Promise.all(attempts).then((results) => {
    const ok = results.some(Boolean);
    if (ok) setUnlocked(true);
    return ok;
  });
}

export function unlockAudio(): Promise<boolean> {
  return primeAllSounds();
}

if (typeof window !== "undefined") {
  ALARM_SOUNDS.forEach((s) => getAudio(s.url));
  const unlock = () => {
    if (audioUnlocked) return;
    primeAllSounds();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    window.removeEventListener("click", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
  window.addEventListener("click", unlock);
}

// Currently-playing alarm elements. Kept so volume/mute slider changes
// take effect on an alarm that is already ringing (previously the slider
// only affected the next play, which scared users who couldn't lower a
// blaring alarm in real time).
const playing = new Set<HTMLAudioElement>();

export function applyLiveAlarmSettings(settings: AlarmSettings) {
  playing.forEach((a) => {
    try {
      a.muted = settings.muted || !settings.enabled;
      a.volume = perceptual(settings.volume);
      if (!settings.enabled) {
        a.pause();
        a.currentTime = 0;
      }
    } catch {
      /* ignore */
    }
  });
}

export function stopAllAlarms() {
  playing.forEach((a) => {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      /* ignore */
    }
  });
  playing.clear();
}

function playFile(url: string, settings: AlarmSettings) {
  if (!settings.enabled || settings.muted || settings.volume <= 0) return;
  if (typeof window === "undefined") return;
  try {
    // A fresh element per play. The bytes are already in the HTTP cache from
    // the warm element, so this costs nothing, and it means two alarms close
    // together can't fight over one element's currentTime/volume.
    const a = new Audio(url);
    a.preload = "auto";
    a.muted = false;
    a.volume = perceptual(settings.volume);
    playing.add(a);
    const cleanup = () => {
      playing.delete(a);
      a.removeEventListener("ended", cleanup);
      a.removeEventListener("pause", cleanup);
      a.removeEventListener("error", cleanup);
    };
    a.addEventListener("ended", cleanup);
    a.addEventListener("pause", cleanup);
    a.addEventListener("error", cleanup);
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.catch((err) => {
        console.warn("[alarm] playback blocked or failed:", err?.name ?? err);
        cleanup();
      });
    }
  } catch {
    /* ignore */
  }
}

function urlFor(id: AlarmSoundId): string {
  return (ALARM_SOUNDS.find((s) => s.id === id) ?? ALARM_SOUNDS[0]).url;
}

// Dedupe rapid duplicate alarm calls (e.g. two tabs, or a re-render firing
// the transition effect twice in quick succession). Same-kind plays within
// 1500ms are collapsed into one audible ring.
let lastKind: string | null = null;
let lastKindAt = 0;
function dedupeAndPlay(kind: string, url: string, settings: AlarmSettings) {
  const now = Date.now();
  if (lastKind === kind && now - lastKindAt < 1500) return;
  lastKind = kind;
  lastKindAt = now;
  playFile(url, settings);
}

export function playBreakStart() {
  const s = settingsState;
  dedupeAndPlay("start:" + s.breakStartSound, urlFor(s.breakStartSound), s);
}
export function playBreakEnd() {
  const s = settingsState;
  dedupeAndPlay("end:" + s.breakEndSound, urlFor(s.breakEndSound), s);
}

// Returns false when the current settings mean the real alarm would stay
// silent, so the UI can say why instead of the button looking broken.
export function previewSound(id: AlarmSoundId): boolean {
  const s = settingsState;
  if (!s.enabled || s.muted || s.volume <= 0) return false;
  playFile(urlFor(id), s);
  return true;
}

export function useAlarm() {
  const settings = useSyncExternalStore(subscribeSettings, getAlarmSettings, () => DEFAULTS);
  const [unlocked, setUnlockedState] = useState<boolean>(false);
  useEffect(() => {
    setUnlockedState(audioUnlocked);
    const cb = (v: boolean) => setUnlockedState(v);
    unlockListeners.add(cb);
    return () => {
      unlockListeners.delete(cb);
    };
  }, []);
  return useMemo(
    () => ({
      settings,
      update: setAlarmSettings,
      sounds: ALARM_SOUNDS,
      unlocked,
      unlock: unlockAudio,
      stop: stopAllAlarms,
      playBreakStart,
      playBreakEnd,
      preview: previewSound,
      testBreakStart: () => previewSound(settings.breakStartSound),
      testBreakEnd: () => previewSound(settings.breakEndSound),
    }),
    [settings, unlocked],
  );
}
