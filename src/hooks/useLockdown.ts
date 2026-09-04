import { useEffect } from "react";

// Right click, text selection and the devtools shortcuts, turned off.
//
// Worth being straight about the ceiling: this is a deterrent, not protection.
// Devtools still opens from the browser's own menu, and view-source, "save
// page" and any HTTP client reach the same markup. Anything that must stay
// private has to live on the server, not behind a keydown handler.
//
// Form fields are exempt throughout. A page where you cannot select the text
// you just typed, or copy a room link out of a field, is broken rather than
// locked.

const isField = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") !== null ||
    el.isContentEditable);

export function useLockdown() {
  useEffect(() => {
    const swallow = (e: Event) => {
      if (isField(e.target)) return;
      e.preventDefault();
    };

    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      // F12, and the inspector / console / picker triples.
      if (k === "f12" || (mod && e.shiftKey && (k === "i" || k === "j" || k === "c"))) {
        e.preventDefault();
        return;
      }
      // View source and save page.
      if (mod && !e.shiftKey && (k === "u" || k === "s")) {
        e.preventDefault();
        return;
      }
      // Select-all only bites outside a field, where there is nothing to select.
      if (mod && k === "a" && !isField(e.target)) e.preventDefault();
    };

    document.addEventListener("contextmenu", swallow);
    document.addEventListener("selectstart", swallow);
    document.addEventListener("copy", swallow);
    document.addEventListener("cut", swallow);
    document.addEventListener("dragstart", swallow);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("contextmenu", swallow);
      document.removeEventListener("selectstart", swallow);
      document.removeEventListener("copy", swallow);
      document.removeEventListener("cut", swallow);
      document.removeEventListener("dragstart", swallow);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
}
