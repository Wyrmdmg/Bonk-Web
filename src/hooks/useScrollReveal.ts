import { useEffect } from "react";

/**
 * Fades sections in as they scroll into view, staggered.
 *
 * The `reveal` class is added from here rather than written into the markup, so
 * without JS every section simply renders visible instead of staying at opacity 0.
 * Re-runs on `key` (the route path) because a client navigation swaps the
 * content underneath us without remounting this hook.
 */
export function useScrollReveal(key: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>("main [data-reveal], main > div > section"),
    ).filter((el) => !el.classList.contains("in-view"));
    if (targets.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in-view");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );

    targets.forEach((el, i) => {
      el.classList.add("reveal");
      el.style.setProperty("--rd", `${(i % 5) * 55}ms`);
      io.observe(el);
    });

    return () => io.disconnect();
  }, [key]);
}
