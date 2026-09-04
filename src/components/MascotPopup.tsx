import { useEffect, useState } from "react";

// Artboard 02, spec 09, mascot pop-up.
// She enters from a panel edge, holds, and leaves the same way: 240ms in
// (3 steps), 2400ms hold, 240ms out. She interrupts nothing, blocks nothing,
// and never takes the centre. scarf.png runs identical timing on the
// opposite edge. Reduced motion turns pop-ups off entirely.

const CYCLE_MS = 2880;

type Who = "gingham" | "scarf";
type Pop = { id: number; who: Who; line: string };

// Same window-event pattern the profile refresh already uses, so any screen
// can trigger her without threading props or adding a store.
export function popMascot(line: string, who: Who = "gingham") {
  window.dispatchEvent(new CustomEvent("wd:mascot", { detail: { line, who } }));
}

export function MascotHost() {
  const [pop, setPop] = useState<Pop | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const onPop = (e: Event) => {
      const { line, who } = (e as CustomEvent<{ line: string; who: Who }>).detail;
      setPop({ id: Date.now(), who, line });
      clearTimeout(timer);
      timer = setTimeout(() => setPop(null), CYCLE_MS);
    };
    window.addEventListener("wd:mascot", onPop);
    return () => {
      window.removeEventListener("wd:mascot", onPop);
      clearTimeout(timer);
    };
  }, []);

  if (!pop) return null;
  const rightEdge = pop.who === "gingham";

  return (
    <div
      key={pop.id}
      aria-hidden
      className={`mascot-peek pointer-events-none fixed bottom-0 z-[60] flex items-end gap-2 ${
        rightEdge ? "right-6 flex-row-reverse" : "left-6"
      }`}
    >
      <img
        src={`/mascot/${pop.who}.png`}
        width={72}
        height={72}
        alt=""
        draggable={false}
        className="pixel"
        style={{ width: 72, height: 72 }}
      />
      {pop.line && (
        <p className="panel-ink mb-4 max-w-[220px] px-3 py-2 font-mono text-[11px] leading-snug">
          {pop.line}
        </p>
      )}
    </div>
  );
}
