import { useCallback, useEffect, useState } from "react";

export type CustomTheme = {
  id: string;
  name: string;
  gifUrl?: string;
  accentHighlight?: string;
  primaryText?: string;
  secondaryText?: string;
  panelBackground?: string;
  buttonAccent?: string;
  overlayTint?: string;
  solidBackground?: string;
  overlayOpacity: number; // 0-100
  glassBlur: number; // 0-40 px
  panelRoundness: number; // 0-32 px
};

const SLOTS_KEY = "wd.customThemes";
const ACTIVE_KEY = "wd.activeCustomTheme";
export const MAX_SLOTS = 3;

export const DEFAULT_THEME: Omit<CustomTheme, "id" | "name"> = {
  overlayOpacity: 30,
  glassBlur: 0,
  panelRoundness: 12,
};

function readSlots(): CustomTheme[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    return raw ? (JSON.parse(raw) as CustomTheme[]) : [];
  } catch {
    return [];
  }
}
function readActive(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function applyCustomTheme(t: CustomTheme | null) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const setVar = (n: string, v?: string | null) => {
    if (v == null || v === "") el.style.removeProperty(n);
    else el.style.setProperty(n, v);
  };
  if (!t) {
    [
      "--ct-gif",
      "--ct-overlay-tint",
      "--ct-overlay-opacity",
      "--ct-glass-blur",
      "--ct-panel-radius",
      "--background",
      "--foreground",
      "--primary",
      "--accent",
      "--muted-foreground",
      "--card",
      "--popover",
      "--muted",
      "--card-foreground",
      "--popover-foreground",
      "--secondary",
      "--border",
      "--input",
      "--color-panel",
      "--flame",
      "--flame-hover",
      "--hairline",
      "--sage",
      "--olive",
      "--bone",
      "--ink",
      "--ink-soft",
      "--radius",
      "--ring",
      "--panel",
    ].forEach((n) => el.style.removeProperty(n));
    delete el.dataset.ctActive;
    delete el.dataset.ctHasBg;
    return;
  }
  el.dataset.ctActive = "true";
  if (t.gifUrl) el.dataset.ctHasBg = "true";
  else delete el.dataset.ctHasBg;
  const safeUrl = t.gifUrl ? t.gifUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"') : null;
  setVar("--ct-gif", safeUrl ? `url("${safeUrl}")` : null);
  setVar("--ct-overlay-tint", t.overlayTint ?? null);
  setVar("--ct-overlay-opacity", String((t.overlayOpacity ?? 30) / 100));
  setVar("--ct-glass-blur", `${t.glassBlur ?? 0}px`);
  setVar("--ct-panel-radius", `${t.panelRoundness ?? 12}px`);
  setVar("--radius", `${t.panelRoundness ?? 12}px`);

  // Direct raw-value overrides (tokens are consumed via var(--x) in @theme inline).
  setVar("--primary", t.accentHighlight ?? null);
  setVar("--accent", t.accentHighlight ?? null);
  setVar("--ring", t.accentHighlight ?? null);
  setVar("--flame", t.accentHighlight ?? null);
  setVar("--flame-hover", t.accentHighlight ?? null);

  setVar("--foreground", t.primaryText ?? null);
  setVar("--ink", t.primaryText ?? null);
  setVar("--card-foreground", t.primaryText ?? null);
  setVar("--popover-foreground", t.primaryText ?? null);

  setVar("--muted-foreground", t.secondaryText ?? null);
  setVar("--ink-soft", t.secondaryText ?? null);

  setVar("--card", t.panelBackground ?? null);
  setVar("--popover", t.panelBackground ?? null);
  setVar("--muted", t.panelBackground ?? null);
  setVar("--color-panel", t.panelBackground ?? null);
  setVar("--panel", t.panelBackground ?? null);
  setVar("--bone", t.panelBackground ?? null);

  setVar("--secondary", t.buttonAccent ?? null);
  setVar("--border", t.buttonAccent ?? null);
  setVar("--input", t.buttonAccent ?? null);
  setVar("--hairline", t.buttonAccent ?? null);
  setVar("--sage", t.buttonAccent ?? null);

  setVar("--background", t.solidBackground ?? null);
  setVar("--olive", t.solidBackground ?? null);
}

/** Fired whenever the active theme changes from outside this hook, so the panel
 *  does not go on showing a tick beside a theme that is no longer on. */
export const CUSTOM_THEME_EVENT = "wd:customtheme";

/**
 * Switches the custom theme off, keeping the saved slot.
 *
 * A custom theme writes --bone, --ink, --olive, --background and a full-screen
 * backdrop layer as inline styles on <html>, which outrank every stylesheet
 * rule. While one is on, Display Properties is inert: the scheme cannot move
 * the tokens and the wallpaper is painted underneath a layer that covers it.
 * Two whole-desktop themes cannot both be on, so the last choice wins, and this
 * is how the desktop's own settings take the machine back.
 */
export function clearCustomTheme() {
  if (typeof document === "undefined") return;
  if (!readActive()) return;
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* private mode: nothing was persisted to clear */
  }
  applyCustomTheme(null);
  window.dispatchEvent(new CustomEvent(CUSTOM_THEME_EVENT));
}

export function useCustomTheme() {
  const [slots, setSlots] = useState<CustomTheme[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const s = readSlots();
    const a = readActive();
    setSlots(s);
    setActiveId(a);
    setHydrated(true);
    const active = s.find((x) => x.id === a) ?? null;
    applyCustomTheme(active);
    // Display Properties can switch the theme off from the other side of the
    // desktop; without this the panel keeps claiming it is still on.
    const sync = () => setActiveId(readActive());
    window.addEventListener(CUSTOM_THEME_EVENT, sync);
    return () => window.removeEventListener(CUSTOM_THEME_EVENT, sync);
  }, []);

  const active = slots.find((s) => s.id === activeId) ?? null;

  const persistSlots = useCallback((next: CustomTheme[]) => {
    setSlots(next);
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(next));
    } catch {
      /* */
    }
  }, []);

  const saveTheme = useCallback(
    (theme: Omit<CustomTheme, "id"> & { id?: string }) => {
      const current = readSlots();
      const id = theme.id ?? crypto.randomUUID();
      const existingIdx = current.findIndex((s) => s.id === id);
      let next: CustomTheme[];
      if (existingIdx >= 0) {
        next = [...current];
        next[existingIdx] = { ...theme, id };
      } else {
        if (current.length >= MAX_SLOTS) {
          throw new Error(`All ${MAX_SLOTS} slots are full. Delete one first.`);
        }
        next = [...current, { ...theme, id }];
      }
      persistSlots(next);
      return id;
    },
    [persistSlots],
  );

  const deleteTheme = useCallback(
    (id: string) => {
      const next = readSlots().filter((s) => s.id !== id);
      persistSlots(next);
      if (readActive() === id) {
        try {
          localStorage.removeItem(ACTIVE_KEY);
        } catch {
          /* */
        }
        setActiveId(null);
        applyCustomTheme(null);
      }
    },
    [persistSlots],
  );

  const applyThemeId = useCallback((id: string | null) => {
    setActiveId(id);
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* */
    }
    const t = id ? (readSlots().find((s) => s.id === id) ?? null) : null;
    applyCustomTheme(t);
  }, []);

  return { slots, active, activeId, hydrated, saveTheme, deleteTheme, applyThemeId };
}
