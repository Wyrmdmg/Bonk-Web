// The circular wipe that covers a colour change. The circle is painted in the
// colour the desktop is about to become, so the swap happens invisibly beneath
// it and nothing is ever caught half-crossfaded.
//
// Shared by the tray's light/dark toggle and the scheme selector in Display
// Properties, which is why it lives here rather than inside either of them.

const SEED = 16; // circle's starting diameter, in px
const SWAP_AT = 560; // swap just before the circle has covered the viewport
const FADE_AT = 740;
const DONE_AT = 1060;

let busy = false;

/**
 * Runs `apply` under a wipe growing out of `origin`. Reduced motion, or a wipe
 * already running, applies straight away instead.
 */
export function revealSwap(origin: HTMLElement | null, color: string, apply: () => void) {
  const root = document.documentElement;
  const swap = () => {
    // Freeze transitions for the instant of the swap.
    root.classList.add("theme-swapping");
    apply();
    requestAnimationFrame(() => root.classList.remove("theme-swapping"));
  };

  if (busy || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    swap();
    return;
  }
  busy = true;

  const box = origin?.getBoundingClientRect();
  const cx = box ? box.left + box.width / 2 : window.innerWidth / 2;
  const cy = box ? box.top + box.height / 2 : window.innerHeight / 2;
  const { innerWidth: w, innerHeight: h } = window;
  // Reach the furthest corner from wherever the control happens to be.
  const far = Math.max(
    Math.hypot(cx, cy),
    Math.hypot(w - cx, cy),
    Math.hypot(cx, h - cy),
    Math.hypot(w - cx, h - cy),
  );

  const circle = document.createElement("div");
  circle.className = "theme-reveal";
  circle.style.cssText =
    `left:${cx - SEED / 2}px;top:${cy - SEED / 2}px;width:${SEED}px;height:${SEED}px;` +
    `background:${color};`;
  document.body.appendChild(circle);
  requestAnimationFrame(() => {
    circle.style.transform = `scale(${(far * 2) / SEED + 2})`;
  });

  setTimeout(swap, SWAP_AT);
  setTimeout(() => {
    circle.style.opacity = "0";
  }, FADE_AT);
  setTimeout(() => {
    circle.remove();
    busy = false;
  }, DONE_AT);
}
