import { useRef } from "react";
import { applyScheme, schemeById, schemeForMode, useScheme, type ThemeMode } from "@/lib/scheme";
import { revealSwap } from "@/lib/reveal";

// The tray's light/dark switch. It is a shortcut into the same scheme list that
// Display Properties shows, so flipping it here and picking Midnight there are
// the one setting, not two that can disagree.

export type { ThemeMode };
export { THEME_KEY } from "@/lib/scheme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const scheme = useScheme();
  const btn = useRef<HTMLButtonElement>(null);
  const dark = schemeById(scheme).mode === "dark";

  function toggle() {
    const next: ThemeMode = dark ? "light" : "dark";
    const id = schemeForMode(next);
    revealSwap(btn.current, schemeById(id).desk, () => applyScheme(id));
  }

  // The chip names the stock you would switch *to*, as in the reference.
  return (
    <button
      ref={btn}
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`inline-flex shrink-0 items-center gap-2 border-2 border-[var(--ink)] bg-[var(--bone)] px-2.5 py-1 font-mono text-[11px] font-medium uppercase leading-none tracking-[0.16em] hover:bg-[var(--ink)] hover:text-[var(--bone)] ${className}`}
    >
      <span
        aria-hidden
        className="h-2.5 w-2.5 border border-current"
        style={{ background: dark ? "var(--bone)" : "var(--ink)" }}
      />
      {dark ? "Light" : "Dark"}
    </button>
  );
}
