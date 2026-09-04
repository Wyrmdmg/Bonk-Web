import { useEffect, useState } from "react";
import { clearCustomTheme } from "@/hooks/useCustomTheme";
import type { StringKey } from "@/lib/i18n";

// Colour schemes, the way Display Properties always offered them: the stock
// (light or dark) and the accent colour are one choice, not two, so picking one
// is a single visible change rather than a switch that only some screens obey.
//
// Everything a scheme moves is a token, declared in styles.css under
// :root[data-scheme="..."]. Nothing here paints.

export type ThemeMode = "light" | "dark";
export type Scheme = {
  id: string;
  name: StringKey;
  mode: ThemeMode;
  /** Preview only: the caption bar, the window face and the desktop behind it. */
  bar: string;
  face: string;
  desk: string;
};

export const THEME_KEY = "wd.theme";
export const SCHEME_KEY = "wd.scheme";
/** The light scheme to come back to when the tray toggle leaves dark. */
export const LIGHT_SCHEME_KEY = "wd.lightScheme";

export const SCHEMES: Scheme[] = [
  {
    id: "blue",
    name: "schemeBlue",
    mode: "light",
    bar: "#1e4f96",
    face: "#ece9d8",
    desk: "#4a7d95",
  },
  {
    id: "olive",
    name: "schemeOlive",
    mode: "light",
    bar: "#3f5220",
    face: "#ece9d8",
    desk: "#6d7d4e",
  },
  {
    id: "silver",
    name: "schemeSilver",
    mode: "light",
    bar: "#4a4a5c",
    face: "#ece9d8",
    desk: "#7c7c8c",
  },
  {
    id: "midnight",
    name: "schemeMidnight",
    mode: "dark",
    bar: "#16345c",
    face: "#262b33",
    desk: "#182430",
  },
];

export const DEFAULT_SCHEME = "blue";
export const DARK_SCHEME = "midnight";

export const schemeById = (id: string | null | undefined): Scheme =>
  SCHEMES.find((s) => s.id === id) ?? SCHEMES[0];

/** Writes the choice onto <html> and remembers it. The pre-hydration bootstrap
 *  in __root.tsx does the same thing, so a reload comes back to it. */
export function applyScheme(id: string) {
  if (typeof document === "undefined") return;
  // A saved custom theme pins these same tokens inline on <html>, where nothing
  // in the stylesheet can outrank them. Picking a scheme is a choice to stop
  // using it, so it goes off rather than silently winning.
  clearCustomTheme();
  const s = schemeById(id);
  const root = document.documentElement;
  root.setAttribute("data-theme", s.mode);
  root.setAttribute("data-scheme", s.id);
  try {
    localStorage.setItem(SCHEME_KEY, s.id);
    localStorage.setItem(THEME_KEY, s.mode);
    if (s.mode === "light") localStorage.setItem(LIGHT_SCHEME_KEY, s.id);
  } catch {
    /* private mode: the choice just will not survive the tab */
  }
  window.dispatchEvent(new CustomEvent("wd:scheme"));
}

/** The scheme a plain light/dark switch lands on, keeping the accent you chose. */
export function schemeForMode(mode: ThemeMode): string {
  if (mode === "dark") return DARK_SCHEME;
  try {
    const last = schemeById(localStorage.getItem(LIGHT_SCHEME_KEY));
    return last.mode === "light" ? last.id : DEFAULT_SCHEME;
  } catch {
    return DEFAULT_SCHEME;
  }
}

function current(): string {
  if (typeof document === "undefined") return DEFAULT_SCHEME;
  return schemeById(document.documentElement.getAttribute("data-scheme")).id;
}

/** Reads the live choice and re-renders whenever anything changes it. Starts on
 *  the default so the server and the first client render agree. */
export function useScheme() {
  const [id, setId] = useState(DEFAULT_SCHEME);
  useEffect(() => {
    const sync = () => setId(current());
    sync();
    window.addEventListener("wd:scheme", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("wd:scheme", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return id;
}
