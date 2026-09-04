import { useEffect, useState } from "react";
import { BUILD_ID } from "@/lib/build";
import { useT } from "@/lib/i18n";
import { usePoll } from "@/lib/poll";

/**
 * Tells you when the page you are looking at is older than the site behind it.
 *
 * A single page app keeps running the JavaScript it was served with, for as
 * long as the tab stays open. After a deploy that code is stale: its chunks
 * may no longer exist on the server, so opening an app it had not loaded yet
 * fails outright, and anything the two halves disagree about goes wrong more
 * quietly. Desktop.tsx already catches the loud version of this and tells
 * people to reload. This is the same message, arriving before the failure
 * rather than after it.
 *
 * Nothing is forced. A reload in the middle of a focus session, or with a
 * half written journal entry on screen, would be its own small disaster, so
 * this offers and waits. It can also be dismissed, and stays dismissed for
 * that deploy.
 */
export function UpdateBar() {
  const { t } = useT();
  const [stale, setStale] = useState(false);
  const [hidden, setHidden] = useState(false);

  // A dropped chunk is the same news arriving the hard way, and it means this
  // page is definitely out of date whatever the version endpoint says.
  useEffect(() => {
    const onFail = (e: Event) => {
      const msg = String((e as PromiseRejectionEvent).reason ?? "");
      if (/dynamically imported module|Importing a module script failed/i.test(msg)) setStale(true);
    };
    window.addEventListener("unhandledrejection", onFail);
    window.addEventListener("vite:preloadError", () => setStale(true));
    return () => window.removeEventListener("unhandledrejection", onFail);
  }, []);

  // usePoll already stops while the tab is hidden and backs every poller off
  // together when the backend is unhappy, so this cannot become the thing
  // that keeps a sleeping tab talking. Ten minutes is far more often than
  // anyone deploys and far less often than anyone would notice.
  usePoll(
    async () => {
      if (stale) return;
      try {
        const res = await fetch("/api/build", { cache: "no-store" });
        if (!res.ok) return false;
        const { id } = (await res.json()) as { id?: string };
        // An unknown id on either side means the comparison is meaningless,
        // not that the page is stale. Nagging on a bad read would be worse
        // than saying nothing.
        if (id && BUILD_ID !== "dev" && id !== BUILD_ID) setStale(true);
        return true;
      } catch {
        return false;
      }
    },
    600_000,
    !stale,
  );

  if (!stale || hidden) return null;

  return (
    <div className="update-bar" role="status">
      <span>{t("updateReady")}</span>
      <button className="btn-base btn-primary" onClick={() => window.location.reload()}>
        {t("updateReload")}
      </button>
      <button className="update-dismiss" aria-label={t("dismiss")} onClick={() => setHidden(true)}>
        ×
      </button>
    </div>
  );
}
