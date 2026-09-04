import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { APPS, useWindows, type AppId } from "@/lib/windows";
import { Window } from "@/components/desktop/Window";
import { XPIcon } from "@/components/XPIcon";
import { useT, type StringKey } from "@/lib/i18n";

// The desktop layer: the icons behind the shell, and every open window above
// it. Apps are split out of the main bundle, so a visitor who never opens one
// never downloads a game or a browser.

/** The shell is the site itself; AppShell renders it, because that is where the
 *  route's own content lives. Everything else arrives on demand. */
const LOAD = {
  browser: () => import("@/components/desktop/apps/Browser").then((m) => ({ default: m.Browser })),
  syllabus: () =>
    import("@/components/desktop/apps/Syllabus").then((m) => ({ default: m.Syllabus })),
  cards: () => import("@/components/desktop/apps/Cards").then((m) => ({ default: m.Cards })),
  practice: () =>
    import("@/components/desktop/apps/Practice").then((m) => ({ default: m.Practice })),
  progress: () =>
    import("@/components/desktop/apps/Progress").then((m) => ({ default: m.Progress })),
  minesweeper: () =>
    import("@/components/desktop/apps/Minesweeper").then((m) => ({ default: m.Minesweeper })),
  snake: () => import("@/components/desktop/apps/Snake").then((m) => ({ default: m.Snake })),
  display: () =>
    import("@/components/desktop/apps/DisplayProperties").then((m) => ({
      default: m.DisplayProperties,
    })),
  notes: () => import("@/components/desktop/apps/Notes").then((m) => ({ default: m.Notes })),
  journal: () => import("@/components/desktop/apps/Journal").then((m) => ({ default: m.Journal })),
  calendar: () =>
    import("@/components/desktop/apps/Calendar").then((m) => ({ default: m.Calendar })),
  sounds: () => import("@/components/desktop/apps/Sounds").then((m) => ({ default: m.Sounds })),
} satisfies Record<Exclude<AppId, "shell">, () => Promise<{ default: () => ReactNode }>>;

/**
 * A window's own error boundary. A chunk that never arrives, a deploy that
 * moved while the page was open, a dropped connection, used to reject inside
 * lazy() and reach the root boundary, which replaced the entire desktop with a
 * full-screen "something broke". A program that will not start is that
 * program's problem, so it is reported inside its own window and everything
 * else stays up.
 */
class AppBoundary extends Component<
  { onRetry: () => void; t: (k: StringKey) => string; children: ReactNode },
  { err: Error | null }
> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    const { t } = this.props;
    const err = this.state.err;
    if (!err) return this.props.children;
    // A chunk that could not be fetched cannot be re-fetched: the browser
    // records the failed URL in its module map for the life of the document, so
    // a second import() of the same address fails without touching the network.
    // Nothing but a reload clears that, and the usual reason for it, Bonk was
    // deployed while this page sat open, makes reloading the right answer
    // anyway. Anything else is a crash inside the program, which remounting
    // does fix.
    const stale =
      /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
        err.message,
      );
    return (
      <div className="xp-crash">
        <XPIcon name="mute" size={32} />
        <p>{t("couldNotStart")}</p>
        {stale && <p>{t("updatedWhileOpen")}</p>}
        <code>{err.message}</code>
        <button
          className="btn-base btn-secondary"
          onClick={stale ? () => window.location.reload() : this.props.onRetry}
        >
          {stale ? t("reloadDesktop") : t("tryAgain")}
        </button>
      </div>
    );
  }
}

function AppBody({ app }: { app: AppId }) {
  const { t } = useT();
  // lazy() remembers a rejected import for good, so a retry needs a fresh one.
  // Keeping it in state means only this window reloads, and the boundary's own
  // key changes with it, which is what clears the error it is showing.
  const [attempt, setAttempt] = useState(() =>
    app === "shell" ? null : { n: 0, Comp: lazy(LOAD[app]) },
  );
  if (app === "shell" || !attempt) return null;
  return (
    <AppBoundary
      key={attempt.n}
      t={t}
      onRetry={() => setAttempt((p) => ({ n: (p?.n ?? 0) + 1, Comp: lazy(LOAD[app]) }))}
    >
      <Suspense fallback={<p className="xp-loading">{t("loading")}</p>}>
        <attempt.Comp />
      </Suspense>
    </AppBoundary>
  );
}

/** Order on the desktop, which is also the order in the Start menu. */
export const DESKTOP_APPS: AppId[] = [
  "syllabus",
  "cards",
  "practice",
  "progress",
  "notes",
  "journal",
  "calendar",
  "sounds",
  "browser",
  "minesweeper",
  "snake",
  "display",
];

export function Desktop() {
  const { t } = useT();
  const { windows, open } = useWindows();
  const topZ = Math.max(0, ...windows.filter((w) => !w.minimized).map((w) => w.z));

  return (
    <>
      {/* Always on the desktop. Windows simply cover them, the way icons and
          windows have always worked. */}
      <div className="desk-icons">
        <button className="desk-icon" onClick={() => open("shell")}>
          <XPIcon name="folder-open" size={32} />
          <span>{t("appBonk")}</span>
        </button>
        {DESKTOP_APPS.map((id) => (
          <button key={id} className="desk-icon" onClick={() => open(id)}>
            <XPIcon name={APPS[id].icon} size={32} />
            <span>{t(APPS[id].title)}</span>
          </button>
        ))}
      </div>

      {windows
        .filter((w) => w.app !== "shell")
        .map((w) => (
          <Window key={w.id} win={w} active={w.z === topZ}>
            <AppBody app={w.app} />
          </Window>
        ))}
    </>
  );
}
