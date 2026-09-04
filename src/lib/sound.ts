// The Windows XP event sounds, for the handful of moments that deserve one.
// Off until someone turns it on: a site that makes noise on its own is the
// thing everyone hated about this era, and the browser blocks it anyway until
// the first gesture.

export type UiSound = "click" | "nav" | "ding" | "error" | "notify" | "open" | "close";

const KEY = "wd.sound";
const cache = new Map<UiSound, HTMLAudioElement>();

export function soundEnabled() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private mode: it just won't be remembered */
  }
  window.dispatchEvent(new CustomEvent("wd:sound"));
}

export function playSound(name: UiSound) {
  if (typeof window === "undefined" || !soundEnabled()) return;
  let el = cache.get(name);
  if (!el) {
    el = new Audio(`/xp/snd/${name}.wav`);
    el.volume = 0.35;
    cache.set(name, el);
  }
  el.currentTime = 0;
  // Rejects when the tab has had no gesture yet, or when the same clip is
  // still playing. Neither is worth a console error.
  void el.play().catch(() => {});
}
