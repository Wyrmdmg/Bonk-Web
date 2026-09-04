import { useEffect, useState } from "react";
import { XPIcon } from "@/components/XPIcon";
import { useT, type StringKey } from "@/lib/i18n";

// The boot splash. Holds the desktop back until the sprite sheet and the four
// faces are actually in, so the first frame anyone sees is the finished thing
// rather than a flash of unstyled boxes and broken icons.
//
// Once per tab. On the second visit the assets are cached anyway, and a splash
// you have to sit through on every navigation is a splash you come to hate.

const KEY = "wd.booted";
const ASSETS = ["/xp/icons32.png", "/xp/cursor/arrow.png"];
const MIN_MS = 1100; // long enough to read; short enough not to be a toll gate
const FADE_MS = 420;

const load = (src: string) =>
  new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = img.onerror = () => resolve(); // a missing asset must not wedge the boot
    img.src = src;
  });

export function BootScreen() {
  const { t } = useT();
  const [state, setState] = useState<"off" | "up" | "leaving">("off");
  const [step, setStep] = useState<StringKey>("startingBonk");

  useEffect(() => {
    let booted = true;
    try {
      booted = sessionStorage.getItem(KEY) === "1";
    } catch {
      /* private mode: show it, it is only a second */
      booted = false;
    }
    if (booted) return;
    setState("up");

    let alive = true;
    const wait = Promise.all([
      new Promise((r) => setTimeout(r, MIN_MS)),
      (async () => {
        setStep("loadingIcons");
        await Promise.all(ASSETS.map(load));
        if (!alive) return;
        setStep("loadingFonts");
        await (document.fonts?.ready ?? Promise.resolve());
        if (!alive) return;
        setStep("preparingDesktop");
      })(),
    ]);

    void wait.then(() => {
      if (!alive) return;
      try {
        sessionStorage.setItem(KEY, "1");
      } catch {
        /* nothing to do; it just shows again next navigation */
      }
      setState("leaving");
      setTimeout(() => alive && setState("off"), FADE_MS);
    });

    return () => {
      alive = false;
    };
  }, []);

  // The page behind the splash is fully rendered, so without this it scrolls
  // under it and shows a scrollbar next to a screen that has nothing to scroll.
  useEffect(() => {
    if (state === "off") return;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [state]);

  if (state === "off") return null;

  return (
    <div className={`boot-screen ${state === "leaving" ? "is-leaving" : ""}`} role="status">
      <div className="boot-stack">
        <XPIcon name="logo" size={64} className="boot-logo" />
        <h1 className="boot-word">BONK</h1>
        <p className="boot-sub">{t("sharedFocusTimer")}</p>
        <div className="boot-bar" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p className="boot-step">{t(step)}</p>
      </div>
      <p className="boot-foot">BONK</p>
    </div>
  );
}
