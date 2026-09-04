import { useEffect, useState } from "react";
import { EN, type StringKey } from "./en";
import { ES } from "./es";
import { FR } from "./fr";
import { DE } from "./de";
import { JA } from "./ja";

// The site's own language, written out here rather than fetched.
//
// English is the key set, the default and the fallback: a key nobody has
// translated yet shows its English text instead of a blank or a raw id. The
// other dictionaries are Partial on purpose, so adding a string to en.ts never
// breaks the build — it just reads as English until someone translates it.

export const LANG_KEY = "wd.lang";

export type LangId = "en" | "es" | "fr" | "de" | "ja";
export type { StringKey };

/** `short` is what the tray shows, the way a keyboard indicator always has. */
export const LANGS: { id: LangId; short: string; name: string; english: string }[] = [
  { id: "en", short: "EN", name: "English", english: "English" },
  { id: "es", short: "ES", name: "Español", english: "Spanish" },
  { id: "fr", short: "FR", name: "Français", english: "French" },
  { id: "de", short: "DE", name: "Deutsch", english: "German" },
  { id: "ja", short: "JA", name: "日本語", english: "Japanese" },
];

export const DEFAULT_LANG: LangId = "en";

const DICT: Record<Exclude<LangId, "en">, Partial<Record<StringKey, string>>> = {
  es: ES,
  fr: FR,
  de: DE,
  ja: JA,
};

export const isLang = (v: unknown): v is LangId => LANGS.some((l) => l.id === v);

export function translate(lang: LangId, key: StringKey): string {
  if (lang === "en") return EN[key];
  return DICT[lang]?.[key] ?? EN[key];
}

export function applyLang(id: LangId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("lang", id);
  try {
    localStorage.setItem(LANG_KEY, id);
  } catch {
    /* private mode: it just will not be remembered */
  }
  window.dispatchEvent(new CustomEvent("wd:lang"));
}

function current(): LangId {
  if (typeof document === "undefined") return DEFAULT_LANG;
  const attr = document.documentElement.getAttribute("lang");
  return isLang(attr) ? attr : DEFAULT_LANG;
}

/**
 * The translator. Starts on English so the server render and the first client
 * render agree, then follows whatever the tray is set to.
 */
export function useT() {
  const [lang, setLang] = useState<LangId>(DEFAULT_LANG);
  useEffect(() => {
    const sync = () => setLang(current());
    sync();
    window.addEventListener("wd:lang", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("wd:lang", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { lang, t: (key: StringKey) => translate(lang, key) };
}
