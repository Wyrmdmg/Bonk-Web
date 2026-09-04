import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeft, X } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useAuth } from "@/hooks/useAuth";
import { useProgression } from "@/hooks/useProgression";
import { useUserStatus, STATUS_META, type UserStatus } from "@/hooks/useUserStatus";
import { AvatarPic } from "@/components/AvatarPic";
import { UserTag } from "@/components/UserTag";
import { CustomThemePanel } from "@/components/CustomThemePanel";
import { PixelIcon } from "@/components/PixelIcon";
import { XPIcon, type XPIconName } from "@/components/XPIcon";
import { Taskbar } from "@/components/Taskbar";
import { Window } from "@/components/desktop/Window";
import { useWindows } from "@/lib/windows";
import { playSound } from "@/lib/sound";
import { supabase } from "@/lib/supabase/client";
import { useT, type StringKey } from "@/lib/i18n";

/**
 * Sidebar nav. `group` starts an indented folder; everything else is top level.
 *
 * Each row says what the page is, with its filename after it in a dimmer type.
 * The filenames alone were the joke and also the problem: nobody arrives here
 * knowing that companion.dat is where the pet lives, and the Start menu was
 * already using the plain names, so the two navigations disagreed about what
 * everything was called.
 */
const TREE = [
  { to: "/", label: "aboutBonk", file: "about.md", icon: "info", exact: true },
  { to: "/solo", label: "soloFocus", file: "solo.exe", icon: "clock" },
  { group: "rooms/" },
  { to: "/bonks", label: "rooms", file: "browse.html", icon: "globe", indent: true },
  { to: "/companion", label: "companion", file: "companion.dat", icon: "paint" },
  { to: "/leaderboard", label: "leaderboard", file: "leaderboard.log", icon: "users" },
  { to: "/shop", label: "shop", file: "shop.sh", icon: "star-gold" },
  { to: "/legal", label: "legalNav", file: "legal.txt", icon: "info" },
] as const satisfies ReadonlyArray<
  | { group: string }
  | {
      to: string;
      label: StringKey;
      file: string;
      icon: XPIconName;
      exact?: boolean;
      indent?: boolean;
    }
>;

const RAIL_KEY = "wd.sidebar";

// Every route renders its own AppShell, so the sidebar unmounts on navigation
// and a fresh one has no idea where the marker was. Remembering the last
// position at module scope lets the new one start where the old one ended and
// slide to the new row, instead of appearing at its destination.
//
// `liveGen` settles which instance owns that memory. Both sidebars exist for a
// moment during a route change, and the *outgoing* one sees the active class
// land first: left alone it animates its own about-to-be-discarded element and
// advances the shared position, so the incoming one mounts already at the
// destination with nothing left to animate. Only the newest instance writes.
type MarkerPos = { top: number; height: number };
let lastMarker: MarkerPos | null = null;
// Where a slide still needs to start from. Held until an animation actually
// finishes, so if the instance that began the slide is torn down mid-flight the
// next one restarts it from the same origin instead of appearing at the end.
let pendingFrom: MarkerPos | null = null;
let liveGen = 0;

const STATUSES: UserStatus[] = ["online", "idle", "dnd", "invisible", "offline"];

const menuItem =
  "px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink)] no-underline hover:bg-[var(--sage)]";

function AccountMenu({ onCustomize }: { onCustomize: () => void }) {
  const { t } = useT();
  const { profile } = useAuth();
  const prog = useProgression(profile?.id);
  const { status, setStatus } = useUserStatus(profile?.id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!profile) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={menuItem}
      >
        {t("account")}
      </button>
      {open && (
        <div role="menu" className="panel absolute right-0 z-50 mt-1 w-[248px] p-0">
          <div className="titlebar">
            <span className="truncate">{profile.display_name}</span>
          </div>

          <div className="flex items-center gap-2 border-b-2 border-[var(--ink)] px-3 py-2">
            <AvatarPic url={profile.avatar_url} name={profile.display_name} size="sm" />
            <span className="truncate font-mono text-[11px] text-[var(--ink-soft)]">
              @{profile.username}
            </span>
            <UserTag username={profile.username} />
          </div>

          <div className="border-b-2 border-[var(--ink)] px-3 py-2">
            <span className="label-caps">{t("status")}</span>
            <div className="mt-1.5 flex gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  title={t(STATUS_META[s].label)}
                  aria-label={t(STATUS_META[s].label)}
                  aria-pressed={s === status}
                  className={`grid h-6 flex-1 place-items-center border-2 ${
                    s === status
                      ? "border-[var(--flame)] bg-[var(--sage)]"
                      : "border-[var(--ink)] hover:bg-[var(--sage)]"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 border border-[var(--ink)] ${STATUS_META[s].dot}`}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-2">
            <Link
              to="/u/$username"
              params={{ username: profile.username }}
              onClick={() => setOpen(false)}
              className="btn-tertiary w-full no-underline"
            >
              {t("profile")}
            </Link>
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="btn-tertiary w-full no-underline"
            >
              {t("settings")}
            </Link>
            <button
              onClick={() => {
                onCustomize();
                setOpen(false);
              }}
              className="btn-tertiary w-full"
            >
              {t("customizeTheme")}
            </button>
            <button
              onClick={() => void supabase.auth.signOut()}
              className="btn-tertiary w-full text-[var(--flame)]"
            >
              {t("signOut")}
            </button>
          </div>
          {prog && (
            <div className="flex items-center justify-between border-t-2 border-[var(--ink)] px-3 py-2">
              <Link
                to="/shop"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 no-underline"
              >
                <PixelIcon name="star-gold" size={16} />
                <span className="font-data text-[13px]">{prog.coins}</span>
              </Link>
              <span className="label-caps">
                {prog.currentStreak
                  ? `${prog.currentStreak}${t("dayStreakSuffix")}`
                  : t("noStreak")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate, onHide }: { onNavigate?: () => void; onHide?: () => void }) {
  const { t } = useT();
  const { profile } = useAuth();
  const { pathname } = useRouterState({ select: (s) => s.location });
  const navRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState(pendingFrom ?? lastMarker);
  const markerRef = useRef<HTMLSpanElement>(null);

  // The router applies the active class asynchronously, so a single measurement
  // on route change can run before it lands; watching class changes catches it
  // whenever it happens. The marker keeps its last known position when no active
  // row is found, because resetting it to zero is what made it drop from the top
  // of the list on every navigation.
  //
  // The slide is driven by the Web Animations API rather than a CSS transition.
  // Every route renders its own AppShell, so the sidebar unmounts on navigation
  // and the marker element is brand new: a CSS transition has no previous
  // computed value to animate away from and simply snaps. WAAPI takes an
  // explicit start value, so it does not care that the element was just created.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const gen = ++liveGen;
    const measure = () => {
      if (gen !== liveGen) return; // an outgoing instance; its element is on its way out
      const active = nav.querySelector<HTMLElement>(".tree-item.active");
      if (!active) return;
      const next = { top: active.offsetTop, height: active.offsetHeight };
      const from = pendingFrom ?? lastMarker;
      lastMarker = next;
      setMarker(next);
      const el = markerRef.current;
      const settled = from && from.top === next.top && from.height === next.height;
      if (settled) pendingFrom = null;
      if (!el || !from || settled) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      pendingFrom = from;
      el.animate(
        [
          { top: `${from.top}px`, height: `${from.height}px` },
          { top: `${next.top}px`, height: `${next.height}px` },
        ],
        { duration: 300, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
      ).finished.then(
        () => {
          pendingFrom = null;
        },
        () => {
          /* cancelled with the element; the next instance picks the slide up */
        },
      );
    };
    const mo = new MutationObserver(() => measure());
    mo.observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className="panel flex h-full flex-col p-0">
      <div className={`titlebar ${onHide ? "titlebar-live" : ""}`}>
        <span>{t("fileManager")}</span>
        {onHide && (
          <button
            onClick={onHide}
            aria-label={t("hideFileManager")}
            title={t("hideFileManager")}
            className="cap-close"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      <div className="border-b-2 border-[var(--ink)] px-4 py-4">
        <span className="font-pixel text-[17px] leading-none tracking-tight">BONK</span>
        <p className="mt-2 font-mono text-[11px] leading-[1.5] text-[var(--ink-soft)]">
          {t("sharedFocusTimer")}
        </p>
      </div>

      <nav ref={navRef} className="relative flex flex-col py-2">
        <span
          ref={markerRef}
          aria-hidden
          className="tree-marker"
          style={{ top: marker?.top ?? 0, height: marker?.height ?? 0, opacity: marker ? 1 : 0 }}
        />
        {TREE.map((n, i) =>
          "group" in n ? (
            <span key={i} className="label-caps px-3 pb-1 pt-3">
              {n.group}
            </span>
          ) : (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: "exact" in n ? n.exact : false }}
              onClick={() => {
                playSound("nav");
                onNavigate?.();
              }}
              className={`tree-item has-icon relative z-[1] ${"indent" in n && n.indent ? "pl-7" : ""}`}
            >
              <XPIcon name={n.icon} size={16} />
              <span className="tree-name">{t(n.label)}</span>
              <span className="tree-file">{n.file}</span>
            </Link>
          ),
        )}
        {profile && (
          <>
            <span className="label-caps px-3 pb-1 pt-3">account/</span>
            <Link
              to="/settings"
              onClick={onNavigate}
              className="tree-item has-icon relative z-[1] pl-7"
            >
              <XPIcon name="gear" size={16} />
              <span className="tree-name">{t("settings")}</span>
              <span className="tree-file">settings.cfg</span>
            </Link>
            <Link
              to="/u/$username"
              params={{ username: profile.username }}
              onClick={onNavigate}
              className="tree-item has-icon relative z-[1] pl-7"
              // The active class is driven by the router; params make this the
              // *own* profile link, so highlight it only on your own page.
              activeOptions={{ exact: true }}
            >
              <XPIcon name="user" size={16} />
              <span className="tree-name">{t("profile")}</span>
              <span className="tree-file">profile.md</span>
            </Link>
          </>
        )}
      </nav>

      <div className="mt-auto border-t-2 border-[var(--ink)] px-4 py-3">
        <p className="font-mono text-[11px] text-[var(--ink-soft)]">{t("buildPassing")}</p>
        <p className="mt-1.5 flex items-start gap-2 font-mono text-[11px] leading-[1.5] text-[var(--ink-soft)]">
          <span className="mt-[3px] inline-block h-2 w-2 shrink-0 bg-[var(--moss)]" aria-hidden />
          {profile ? `${t("signedInAs")} ${profile.username}` : t("browsingAsGuest")}
        </p>
        {/* Belt and braces: the tree is the nav, but this is the one route the
            tree cannot show while it is the reason you are here. */}
        {!profile && pathname !== "/auth" && (
          <Link
            to="/auth"
            onClick={onNavigate}
            className="btn-base btn-secondary mt-3 w-full no-underline"
          >
            {t("signIn")}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * The desktop. Menubar on top, file-tree sidebar on the left, the route in a
 * window pane, taskbar along the bottom, the reference's layout, and the
 * reason navigation is now the same in every corner of the app instead of a
 * header that changed shape per page.
 *
 * `title` names the window; pass the route's own filename.
 */
export function AppShell({
  title = "bonk.exe",
  children,
  bare = false,
}: {
  title?: string;
  children: ReactNode;
  /** Drops the sidebar for full-bleed screens (auth, consent). */
  bare?: boolean;
}) {
  const { t } = useT();
  const { pathname } = useRouterState({ select: (st) => st.location });
  useScrollReveal(pathname);
  const [themeOpen, setThemeOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // the mobile drawer
  const [railOpen, setRailOpen] = useState(true); // the desktop sidebar
  const { profile, loading } = useAuth();
  const { windows, retitle } = useWindows();

  // The site runs in a window like everything else on the desktop: draggable,
  // resizable, minimisable, closable, and opening at its own size rather than
  // filling the screen.
  const shell = windows.find((w) => w.app === "shell");
  const topZ = Math.max(0, ...windows.filter((w) => !w.minimized).map((w) => w.z));

  // The caption follows the route, so the taskbar button reads about.md rather
  // than a fixed program name.
  useEffect(() => {
    if (shell) retitle(shell.id, title);
  }, [shell, retitle, title]);

  useEffect(() => {
    try {
      setRailOpen(localStorage.getItem(RAIL_KEY) !== "0");
    } catch {
      /* private mode, it just won't be remembered */
    }
  }, []);

  useEffect(() => {
    const onResize = () => window.innerWidth >= 1024 && setNavOpen(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setRail = (open: boolean) => {
    setRailOpen(open);
    try {
      localStorage.setItem(RAIL_KEY, open ? "1" : "0");
    } catch {
      /* private mode: it just won't be remembered */
    }
  };

  // One control, because "show me the file manager" is one intention whatever
  // the screen is; only the mechanism differs (drawer below lg, rail above).
  const toggleNav = () => {
    if (window.innerWidth >= 1024) setRail(!railOpen);
    else setNavOpen((v) => !v);
  };
  const hideSidebar = () => {
    if (window.innerWidth >= 1024) setRail(false);
    else setNavOpen(false);
  };

  return (
    <>
      {shell && (
        <Window win={shell} active={shell.z === topZ}>
          <div className="shell">
            {/* Menu bar, system actions only. Page navigation lives in the
                tree, so the two never compete for the same click. */}
            <header className="shell-menu">
              <Link to="/" className="px-2 py-1 font-pixel text-[11px] leading-none no-underline">
                BONK
              </Link>
              {!bare && (
                <button
                  onClick={toggleNav}
                  className={`${menuItem} inline-flex items-center gap-1.5`}
                  aria-expanded={navOpen || railOpen}
                  title={t("showHideFileManager")}
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                  {t("files")}
                </button>
              )}
              <Link to="/solo" className={`${menuItem} hidden sm:inline-block`}>
                {t("focus")}
              </Link>
              <Link to="/bonks" className={`${menuItem} hidden sm:inline-block`}>
                {t("rooms")}
              </Link>

              <div className="ml-auto flex items-center gap-2">
                {profile ? (
                  <AccountMenu onCustomize={() => setThemeOpen(true)} />
                ) : loading ? (
                  <span
                    className="h-5 w-16 border-2 border-[var(--disabled)] bg-[var(--sage)]"
                    aria-label={t("restoringSession")}
                  />
                ) : (
                  <Link to="/auth" className={menuItem}>
                    {t("signIn")}
                  </Link>
                )}
              </div>
            </header>

            {/* Tree pane on the left, content on the right, each scrolling on
                its own so the nav does not slide away with the page. */}
            <div className="shell-panes">
              {!bare && (
                <aside
                  className={`shell-rail ${navOpen ? "block" : "hidden"} ${
                    railOpen ? "lg:block" : "lg:hidden"
                  }`}
                >
                  <Sidebar onNavigate={() => setNavOpen(false)} onHide={hideSidebar} />
                </aside>
              )}

              <main className={`shell-main ${navOpen && !bare ? "hidden lg:block" : ""}`}>
                {children}
                {/* The terms are in the sidebar as legal.txt, which is where
                    someone browsing the site finds them and nowhere near where
                    someone looking for them expects to. Every page ends with a
                    plain link to the same page. */}
                <footer className="shell-foot">
                  <Link to="/legal">{t("legalNav")}</Link>
                </footer>
              </main>
            </div>
          </div>
        </Window>
      )}

      <Taskbar />
      <CustomThemePanel open={themeOpen} onClose={() => setThemeOpen(false)} />
    </>
  );
}
