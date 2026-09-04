import { useEffect, useState } from "react";
import { clearCustomTheme } from "@/hooks/useCustomTheme";
import type { StringKey } from "@/lib/i18n";

// Wallpapers, drawn rather than photographed. Every one is hard-stop bands plus
// a dither, so it stays in the same grainy register as the rest of the desktop
// and costs nothing to download.

export const WALL_KEY = "wd.wall";
export const WALL_TINT_KEY = "wd.wallTint";

/** A crossed 2px hatch. Self-sizing, so a wallpaper is a plain layer list. */
const DITHER = (a: string, b = "transparent") =>
  `repeating-linear-gradient(45deg, ${a} 0 2px, ${b} 2px 4px), ` +
  `repeating-linear-gradient(-45deg, ${a} 0 2px, ${b} 2px 4px)`;

/** Hard stops, no interpolation: the bands are the point. */
const bands = (...stops: string[]) => {
  const step = 100 / stops.length;
  return `linear-gradient(180deg, ${stops
    .map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`)
    .join(", ")})`;
};

export type Wallpaper = { id: string; name: StringKey; image: string; color: string };

export const WALLPAPERS: Wallpaper[] = [
  {
    id: "hill",
    name: "wallGreenHill",
    color: "#4a7d95",
    image: [
      DITHER("rgba(255,255,255,0.05)", "transparent"),
      bands("#8fc4dd", "#79b3d3", "#66a3c8", "#5b93b4", "#6f9a60", "#54843f"),
    ].join(", "),
  },
  {
    id: "teal",
    name: "wallClassicTeal",
    color: "#2f6f6a",
    image: [DITHER("rgba(255,255,255,0.05)", "transparent"), bands("#3b807a", "#2f6f6a")].join(
      ", ",
    ),
  },
  {
    id: "azul",
    name: "wallAzul",
    color: "#2b5a8c",
    image: [
      DITHER("rgba(255,255,255,0.045)", "transparent"),
      bands("#4d84bd", "#3f74ad", "#33649c", "#2b5a8c", "#234a74"),
    ].join(", "),
  },
  {
    id: "storm",
    name: "wallStorm",
    color: "#2a3038",
    image: [
      DITHER("rgba(255,255,255,0.04)", "transparent"),
      bands("#3c454f", "#343c46", "#2d343d", "#262c34", "#1f242b"),
    ].join(", "),
  },
  {
    id: "ember",
    name: "wallEmber",
    color: "#7a4630",
    image: [
      DITHER("rgba(255,255,255,0.05)", "transparent"),
      bands("#c98a52", "#b87445", "#a15f3c", "#874c34", "#6b3c2b"),
    ].join(", "),
  },
  {
    id: "plum",
    name: "wallPlum",
    color: "#4a3a63",
    image: [
      DITHER("rgba(255,255,255,0.045)", "transparent"),
      bands("#7a6499", "#6a568a", "#5b487a", "#4a3a63", "#3a2d4e"),
    ].join(", "),
  },
  {
    id: "grid",
    name: "wallBlueprint",
    color: "#1b3550",
    image: [
      "repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 16px)",
      "repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 1px, transparent 1px 16px)",
      bands("#24446a", "#1b3550"),
    ].join(", "),
  },
  {
    id: "grain",
    name: "wallStatic",
    color: "#3a3a38",
    image: [
      DITHER("rgba(255,255,255,0.09)", "rgba(0,0,0,0.06)"),
      "linear-gradient(#3a3a38, #3a3a38)",
    ].join(", "),
  },
];

export function applyWallpaper(id: string | null, tint: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const wall = WALLPAPERS.find((w) => w.id === id);
  if (tint) {
    // A flat colour still gets the dither, or it is the one smooth thing left.
    root.style.setProperty("--wall-image", DITHER("rgba(255,255,255,0.06)"));
    root.style.setProperty("--wall-color", tint);
  } else if (wall) {
    root.style.setProperty("--wall-image", wall.image);
    root.style.setProperty("--wall-color", wall.color);
  } else {
    root.style.removeProperty("--wall-image");
    root.style.removeProperty("--wall-color");
  }
}

function read() {
  try {
    return {
      id: localStorage.getItem(WALL_KEY),
      tint: localStorage.getItem(WALL_TINT_KEY),
    };
  } catch {
    return { id: null, tint: null };
  }
}

/** Reads the stored choice and re-renders whenever anything changes it. */
export function useWallpaper() {
  const [state, setState] = useState<{ id: string | null; tint: string | null }>({
    id: null,
    tint: null,
  });

  useEffect(() => {
    const sync = () => setState(read());
    sync();
    window.addEventListener("wd:wallpaper", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("wd:wallpaper", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = (id: string | null, tint: string | null) => {
    // A custom theme's backdrop covers the whole viewport and blanks the body,
    // so the wallpaper underneath it can never be seen. Choosing one turns that
    // off; the saved theme is still there to re-apply from Customize theme.
    clearCustomTheme();
    try {
      if (id) localStorage.setItem(WALL_KEY, id);
      else localStorage.removeItem(WALL_KEY);
      if (tint) localStorage.setItem(WALL_TINT_KEY, tint);
      else localStorage.removeItem(WALL_TINT_KEY);
    } catch {
      /* private mode: it just will not be remembered */
    }
    applyWallpaper(id, tint);
    window.dispatchEvent(new CustomEvent("wd:wallpaper"));
  };

  return { ...state, set };
}
