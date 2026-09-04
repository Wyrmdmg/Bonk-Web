import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

type PipApi = {
  requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
};
const pip = (): PipApi | null =>
  typeof window !== "undefined"
    ? ((window as unknown as { documentPictureInPicture?: PipApi }).documentPictureInPicture ??
      null)
    : null;

/** Copy the app's CSS into the new document, which starts with none of it. */
function adoptStyles(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = target.createElement("style");
      style.textContent = css;
      target.head.appendChild(style);
    } catch {
      // Cross-origin sheet (the Google Fonts one): its rules can't be read,
      // so re-link it rather than inlining it.
      if (sheet.href) {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        target.head.appendChild(link);
      }
    }
  }
}

/**
 * Renders `children` into a separate always-visible window.
 *
 * The subtree is *portaled*, not re-mounted, so it keeps running on this page's
 * React tree, the timer, its handlers and the todo list are the same instances
 * as the ones on the page. That means no state duplication and no cross-window
 * messaging: whatever the page knows, the pop-out knows.
 *
 * Prefers Document Picture-in-Picture (a real always-on-top mini window) and
 * falls back to a plain popup where that isn't supported.
 */
export function PopOut({
  title,
  label = "Pop out",
  className = "btn-base btn-secondary",
  children,
}: {
  title: string;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const [win, setWin] = useState<Window | null>(null);
  const winRef = useRef<Window | null>(null);

  const close = useCallback(() => {
    winRef.current?.close();
    winRef.current = null;
    setWin(null);
  }, []);

  // Never leave an orphan window behind when this page goes away.
  useEffect(() => () => winRef.current?.close(), []);

  useEffect(() => {
    if (!win) return;
    // A plain popup doesn't reliably fire unload, so poll as well.
    const poll = window.setInterval(() => {
      if (win.closed) {
        winRef.current = null;
        setWin(null);
      }
    }, 800);
    const onGone = () => {
      winRef.current = null;
      setWin(null);
    };
    win.addEventListener("pagehide", onGone);
    // Mirror theme changes made on the main page into the pop-out.
    const root = document.documentElement;
    const sync = () =>
      win.document.documentElement.setAttribute(
        "data-theme",
        root.getAttribute("data-theme") ?? "light",
      );
    const mo = new MutationObserver(sync);
    mo.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    sync();
    return () => {
      window.clearInterval(poll);
      win.removeEventListener("pagehide", onGone);
      mo.disconnect();
    };
  }, [win]);

  async function open() {
    if (winRef.current && !winRef.current.closed) {
      winRef.current.focus();
      return;
    }
    const api = pip();
    const w = api
      ? await api.requestWindow({ width: 288, height: 392 })
      : window.open("", "bonk-focus", "popup=yes,width=300,height=430");
    if (!w) {
      // Silence here looked exactly like a broken button.
      toast.error(
        "Your browser blocked the pop-out window. Allow pop-ups for this site and try again.",
      );
      return;
    }
    w.document.title = title;
    adoptStyles(w.document);
    w.document.body.style.margin = "0";
    w.document.body.style.background = "var(--background)";
    winRef.current = w;
    setWin(w);
  }

  return (
    <>
      <button onClick={win ? close : () => void open()} className={className}>
        {win ? "Close pop-out" : label}
      </button>
      {win && createPortal(children, win.document.body)}
    </>
  );
}
