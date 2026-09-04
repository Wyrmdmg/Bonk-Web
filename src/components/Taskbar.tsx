import { Link, useRouterState } from "@tanstack/react-router";
import { LANGS, applyLang, useT, type StringKey } from "@/lib/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProgression } from "@/hooks/useProgression";
import { levelFromXp } from "@/lib/leveling";
import { AvatarPic } from "@/components/AvatarPic";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { XPIcon, type XPIconName } from "@/components/XPIcon";
import { playSound, setSoundEnabled, soundEnabled } from "@/lib/sound";
import { APPS, useWindowsOptional } from "@/lib/windows";
import { DESKTOP_APPS } from "@/components/desktop/Desktop";
import { supabase } from "@/lib/supabase/client";

type Item = { to: string; label: string; icon: XPIconName; exact?: boolean };

const PROGRAMS: (Item & { key: StringKey })[] = [
  { to: "/", label: "About Bonk", key: "aboutBonk", icon: "info", exact: true },
  { to: "/solo", label: "Solo focus", key: "soloFocus", icon: "clock" },
  { to: "/bonks", label: "Rooms", key: "rooms", icon: "globe" },
  { to: "/companion", label: "Companion", key: "companion", icon: "paint" },
  { to: "/leaderboard", label: "Leaderboard", key: "leaderboard", icon: "users" },
];

/** Closes a flyout on an outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function MenuRow({
  icon,
  children,
  onClick,
  to,
  params,
  tone = "left",
}: {
  icon: XPIconName;
  children: ReactNode;
  onClick?: () => void;
  to?: string;
  params?: Record<string, string>;
  tone?: "left" | "right";
}) {
  const inner = (
    <>
      <XPIcon name={icon} size={tone === "left" ? 32 : 24} />
      <span className="truncate">{children}</span>
    </>
  );
  const cls = `start-row start-row-${tone}`;
  if (to) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Link to={to as any} params={params as any} onClick={onClick} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function StartMenu({ onClose }: { onClose: () => void }) {
  const { profile } = useAuth();
  const { t } = useT();
  const prog = useProgression(profile?.id);
  const wm = useWindowsOptional();

  return (
    <div className="start-menu" role="menu">
      <div className="start-head">
        {profile ? (
          <>
            <AvatarPic url={profile.avatar_url} name={profile.display_name} size="sm" />
            <span className="truncate">{profile.display_name}</span>
          </>
        ) : (
          <>
            <XPIcon name="user" size={24} />
            <span>{t("guest")}</span>
          </>
        )}
      </div>

      <div className="start-body">
        <div className="start-left">
          {PROGRAMS.map((p) => (
            <MenuRow key={p.to} icon={p.icon} to={p.to} onClick={onClose}>
              {t(p.key)}
            </MenuRow>
          ))}
          <hr className="start-rule" />
          <MenuRow icon="star-gold" to="/shop" onClick={onClose}>
            {t("shop")}
          </MenuRow>
          <hr className="start-rule" />
          <span className="start-group">{t("programs")}</span>
          {wm &&
            DESKTOP_APPS.map((id) => (
              <MenuRow
                key={id}
                icon={APPS[id].icon}
                onClick={() => {
                  wm.open(id);
                  onClose();
                }}
              >
                {t(APPS[id].title)}
              </MenuRow>
            ))}
        </div>

        <div className="start-right">
          {profile ? (
            <>
              <MenuRow
                tone="right"
                icon="user"
                to="/u/$username"
                params={{ username: profile.username }}
                onClick={onClose}
              >
                {t("myProfile")}
              </MenuRow>
              <MenuRow tone="right" icon="gear" to="/settings" onClick={onClose}>
                {t("settings")}
              </MenuRow>
              <hr className="start-rule" />
              <MenuRow tone="right" icon="star" to="/shop" onClick={onClose}>
                {prog?.coins ?? 0} {t("coins")}
              </MenuRow>
              <MenuRow tone="right" icon="clock" to="/leaderboard" onClick={onClose}>
                {t("level")} {levelFromXp(prog?.xp ?? 0)}
              </MenuRow>
            </>
          ) : (
            <>
              <MenuRow tone="right" icon="key" to="/auth" onClick={onClose}>
                {t("signIn")}
              </MenuRow>
              <MenuRow tone="right" icon="help" to="/" onClick={onClose}>
                {t("whatIsBonk")}
              </MenuRow>
            </>
          )}
        </div>
      </div>

      <div className="start-foot">
        {profile ? (
          <button
            type="button"
            className="start-power"
            onClick={() => {
              playSound("close");
              onClose();
              void supabase.auth.signOut();
            }}
          >
            <XPIcon name="power" size={24} />
            {t("logOff")}
          </button>
        ) : (
          <Link to="/auth" onClick={onClose} className="start-power">
            <XPIcon name="key" size={24} />
            {t("signIn")}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Month and weekday names come from Intl in the picked language, so the
 *  calendar follows the tray instead of a hardcoded English table. */
const monthName = (lang: string, d: Date) => d.toLocaleDateString(lang, { month: "long" });
const dowNames = (lang: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, 7 + i)).toLocaleDateString(lang, { weekday: "narrow" }),
  );

function Calendar({ today }: { today: Date }) {
  const { lang, t } = useT();
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const pad = first.getDay();
  const shift = (n: number) => setView(new Date(view.getFullYear(), view.getMonth() + n, 1));

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" onClick={() => shift(-1)} aria-label={t("previousMonth")}>
          ◄
        </button>
        <span>
          {monthName(lang, view)} {view.getFullYear()}
        </span>
        <button type="button" onClick={() => shift(1)} aria-label={t("nextMonth")}>
          ►
        </button>
      </div>
      <div className="cal-grid">
        {dowNames(lang).map((d, i) => (
          <span key={i} className="cal-dow">
            {d}
          </span>
        ))}
        {Array.from({ length: pad }, (_, i) => (
          <span key={`p${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const n = i + 1;
          const isToday =
            n === today.getDate() &&
            view.getMonth() === today.getMonth() &&
            view.getFullYear() === today.getFullYear();
          return (
            <span key={n} className={`cal-day ${isToday ? "is-today" : ""}`}>
              {n}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The language indicator, where a keyboard layout indicator has always sat.
 *  Only the desktop chrome is translated; the site's own pages stay English. */
function LanguageChip() {
  const [open, setOpen] = useState(false);
  const { lang, t } = useT();
  const ref = useDismiss(open, () => setOpen(false));
  const here = LANGS.find((l) => l.id === lang) ?? LANGS[0];

  return (
    <div className="tray-lang" ref={ref}>
      <button
        type="button"
        className="tray-btn tray-lang-btn"
        onClick={() => {
          setOpen((v) => !v);
          playSound("click");
        }}
        aria-expanded={open}
        aria-label={t("language")}
        title={`${t("language")}: ${here.name}`}
      >
        {here.short}
      </button>
      {open && (
        <div className="panel tray-lang-menu" role="menu">
          <span className="start-group">{t("language")}</span>
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="menuitemradio"
              aria-checked={l.id === lang}
              className={`lang-row ${l.id === lang ? "is-on" : ""}`}
              onClick={() => {
                applyLang(l.id);
                setOpen(false);
                playSound("click");
              }}
            >
              <span className="lang-short">{l.short}</span>
              <span className="lang-name">{l.name}</span>
              {l.english !== l.name && <em>{l.english}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Tray() {
  const { lang, t } = useT();
  const [now, setNow] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  // Null until mounted: the server has no idea what time it is where you are,
  // and rendering its clock would hydrate-mismatch every load.
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 20_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => setSound(soundEnabled()), []);

  return (
    <div className="tray" ref={ref}>
      <NotificationBell />
      <LanguageChip />
      <button
        type="button"
        className="tray-btn"
        aria-pressed={sound}
        title={sound ? "Mute the interface sounds" : "Play the interface sounds"}
        onClick={() => {
          const next = !sound;
          setSound(next);
          setSoundEnabled(next);
          if (next) playSound("ding");
        }}
      >
        <XPIcon name={sound ? "speaker" : "mute"} size={16} />
      </button>
      <ThemeToggle className="tray-theme" />
      <button
        type="button"
        className="tray-clock"
        onClick={() => {
          setOpen((v) => !v);
          playSound("click");
        }}
        aria-expanded={open}
        title={t("showCalendar")}
      >
        {now ? now.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) : "--:--"}
      </button>
      {open && now && (
        <div className="tray-flyout">
          <Calendar today={now} />
          <p className="cal-foot">{now.toLocaleDateString(lang, { dateStyle: "full" })}</p>
        </div>
      )}
    </div>
  );
}

/**
 * The taskbar. Start menu on the left with every screen in the app, the open
 * window in the middle, clock and system icons on the right, so navigation and
 * status have one home at the bottom of every page instead of being spread
 * across a header and a footer strip.
 */
export function Taskbar() {
  const wm = useWindowsOptional();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const { pathname } = useRouterState({ select: (s) => s.location });
  const { t } = useT();

  // A route change means the menu did its job.
  useEffect(() => setOpen(false), [pathname]);

  // The menu was mouse-only: no way to open it, leave it, or walk it from the
  // keyboard. Escape closes, the arrows walk the rows, and Home/End jump the
  // ends, which is what every menu on this machine did.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        playSound("close");
        return;
      }
      if (!open) return;
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>(".start-menu .start-row, .start-menu .start-power"),
      );
      if (!rows.length) return;
      const at = rows.indexOf(document.activeElement as HTMLElement);
      const step =
        e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowUp"
            ? -1
            : e.key === "Home"
              ? NaN
              : e.key === "End"
                ? NaN
                : 0;
      if (e.key === "Home") {
        e.preventDefault();
        rows[0].focus();
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        rows[rows.length - 1].focus();
        return;
      }
      if (!step) return;
      e.preventDefault();
      rows[(at + step + rows.length) % rows.length].focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="taskbar">
      <div className="relative" ref={ref}>
        {open && <StartMenu onClose={() => setOpen(false)} />}
        <button
          type="button"
          className={`start-btn ${open ? "is-open" : ""}`}
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            playSound(open ? "close" : "open");
          }}
        >
          <XPIcon name="logo" size={22} />
          {t("start")}
        </button>
      </div>

      {wm && (
        <button
          type="button"
          className="show-desk"
          onClick={wm.toggleDesktop}
          title={t("showDesktop")}
        >
          <span aria-hidden />
        </button>
      )}

      <div className="task-strip">
        {wm?.windows.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`task-btn ${!w.minimized ? "is-active" : ""}`}
            onClick={() => (w.minimized ? wm.focus(w.id) : wm.toggleMin(w.id))}
          >
            <XPIcon name={APPS[w.app].icon} size={16} />
            <span className="truncate">{w.title ?? t(APPS[w.app].title)}</span>
          </button>
        ))}
      </div>

      <Tray />
    </div>
  );
}
