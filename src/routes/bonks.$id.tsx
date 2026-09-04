import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useT, type StringKey } from "@/lib/i18n";
import { TimerCard } from "@/components/TimerCard";
import { TodoList } from "@/components/TodoList";
import { LevelBadge } from "@/components/LevelBadge";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useProgression } from "@/hooks/useProgression";
import { useServerFn } from "@tanstack/react-start";
import {
  advanceIfOverdue,
  controlCycle,
  endBonk,
  heartbeatBonk,
  kickFromBonk,
  leaveBonk,
  respondJoinRequest,
  restartCyclesIfDue,
  transferHost,
  unbanFromBonk,
  updateBonkSettings,
} from "@/lib/bonks.functions";
import { recordFocusCompletion, startFocusSession } from "@/lib/progression.functions";
import { getFood } from "@/lib/foods";
import { formatMMSS, useCountdown, useStopwatch } from "@/hooks/useTimer";
import { useAlarm } from "@/hooks/useAlarm";
import { toast } from "sonner";
import { popMascot } from "@/components/MascotPopup";
import {
  Ban,
  Check,
  ListTodo,
  LogOut,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
  ShieldX,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { UserTag } from "@/components/UserTag";
import { BonkChat } from "@/components/BonkChat";
import { AvatarPic } from "@/components/AvatarPic";
import { BadgeChip } from "@/components/BadgeChip";
import { useEquippedBadgesFor } from "@/hooks/useBadges";
import { siteUrl } from "@/lib/site";
import { usePoll } from "@/lib/poll";

export const Route = createFileRoute("/bonks/$id")({
  head: ({ params }) => ({
    meta: [
      { title: "Live room on Bonk" },
      {
        name: "description",
        content: "One timer, shared by everyone in the room. Join in and focus together.",
      },
      { property: "og:title", content: "Live room" },
      {
        property: "og:description",
        content: "One timer, shared by everyone in the room. Join in and focus together.",
      },
      { property: "og:url", content: siteUrl(`/bonks/${params.id}`) },
    ],
    links: [{ rel: "canonical", href: siteUrl(`/bonks/${params.id}`) }],
  }),
  component: BonkRoom,
});

// The room reloads on every realtime event. Handing React a freshly-built
// array each time makes it rebuild the whole member list even when nothing
// changed, which churns the DOM, costs a re-render, and makes password
// managers re-scan the page for login forms on every mutation. Only commit
// state that actually differs.
function keepIfSame<T>(prev: T, next: T): T {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

type Bonk = {
  id: string;
  host_id: string;
  name: string;
  join_mode: string;
  status: string;
  timer_type: "pomodoro" | "stopwatch" | "custom" | "interval";
  focus_min: number;
  break_min: number;
  target_cycles: number;
  current_cycle: number;
  cycle_state: "idle" | "focus" | "break";
  cycle_started_at: string | null;
  cycle_paused_at: string | null;
  auto_restart?: boolean;
  restart_at?: string | null;
  chat_enabled?: boolean;
  chat_slow_mode_sec?: number;
  afk_kick?: boolean;
};
type Member = {
  user_id: string;
  joined_at: string;
  display_name: string;
  username: string;
  xp: number;
  avatar_url: string | null;
};
type Request = {
  id: string;
  user_id: string;
  display_name: string;
  username: string;
  status: string;
};
type Ban = { user_id: string; display_name: string; username: string };

function BonkRoom() {
  const { t } = useT();
  const { id } = Route.useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const prog = useProgression(profile?.id);
  const [bonk, setBonk] = useState<Bonk | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [viewedMember, setViewedMember] = useState<Member | null>(null);
  const [bans, setBans] = useState<Ban[]>([]);
  const [bansOpen, setBansOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const equippedBadges = useEquippedBadgesFor(members.map((m) => m.user_id));

  const heartbeat = useServerFn(heartbeatBonk);
  const control = useServerFn(controlCycle);
  const leave = useServerFn(leaveBonk);
  const end = useServerFn(endBonk);
  const respond = useServerFn(respondJoinRequest);
  const transfer = useServerFn(transferHost);
  const advance = useServerFn(advanceIfOverdue);
  const kick = useServerFn(kickFromBonk);
  const unban = useServerFn(unbanFromBonk);
  const updateSettings = useServerFn(updateBonkSettings);
  const restartDue = useServerFn(restartCyclesIfDue);

  // The four table reads only need `id`, so fire them together instead of in
  // series - four cold round-trips back to back was most of the multi-minute
  // wait to enter a room. The ban-name lookup still has to follow bonk_bans.
  // The in-flight guard stops the 2s poll and the realtime callbacks from
  // stacking a fresh reload on top of one that hasn't come back yet.
  const reloadInFlight = useRef(false);
  const reload = async () => {
    if (reloadInFlight.current) return;
    reloadInFlight.current = true;
    try {
      const [
        { data: b, error: bErr },
        { data: m, error: mErr },
        { data: r, error: rErr },
        { data: bb, error: bbErr },
      ] = await Promise.all([
        supabase.from("bonks").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("bonk_members")
          .select("user_id, joined_at, profiles!inner(display_name, username, xp, avatar_url)")
          .eq("bonk_id", id)
          .order("joined_at", { ascending: true }),
        supabase
          .from("bonk_requests")
          .select("id, user_id, status, profiles!inner(display_name, username)")
          .eq("bonk_id", id)
          .eq("status", "pending"),
        supabase.from("bonk_bans").select("user_id").eq("bonk_id", id),
      ]);
      // Report the failure rather than painting stale state over it, so every
      // poller in the app backs off while the backend is struggling.
      if (bErr || mErr || rErr) return false;
      setBonk((prev) => keepIfSame(prev, b as Bonk | null));
      const nextMembers = (m ?? []).map((row) => ({
        user_id: row.user_id,
        joined_at: row.joined_at,
        display_name: row.profiles.display_name,
        username: row.profiles.username,
        xp: row.profiles.xp ?? 0,
        avatar_url: row.profiles.avatar_url ?? null,
      }));
      setMembers((prev) => keepIfSame(prev, nextMembers));
      const nextRequests = (r ?? []).map((x) => ({
        id: x.id,
        user_id: x.user_id,
        status: x.status,
        display_name: x.profiles.display_name,
        username: x.profiles.username,
      }));
      setRequests((prev) => keepIfSame(prev, nextRequests));
      // Separate query, because bonk_bans has no foreign key to profiles and the
      // embed this used to do answered PGRST200 every time. The error was thrown
      // away and the rows were typed `any`, so the ban list silently stayed empty
      // and a host could never see, or lift, a ban they had made.
      if (bbErr) console.error("[bonk] bans:", bbErr);
      const bannedIds = (bb ?? []).map((x) => x.user_id);
      const { data: banProfiles } = bannedIds.length
        ? await supabase.from("profiles").select("id, display_name, username").in("id", bannedIds)
        : { data: [] };
      const byId = new Map((banProfiles ?? []).map((pr) => [pr.id, pr]));
      const nextBans = bannedIds.flatMap((uid) => {
        const pr = byId.get(uid);
        return pr ? [{ user_id: uid, display_name: pr.display_name, username: pr.username }] : [];
      });
      setBans((prev) => keepIfSame(prev, nextBans));
      return true;
    } finally {
      reloadInFlight.current = false;
    }
  };

  useEffect(() => {
    reload();
  }, [id]);

  useEffect(() => {
    const ch = supabase
      .channel(`bonk-${id}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bonks", filter: `id=eq.${id}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bonk_members", filter: `bonk_id=eq.${id}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bonk_requests", filter: `bonk_id=eq.${id}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bonk_bans", filter: `bonk_id=eq.${id}` },
        reload,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  // Safety net for a dropped realtime socket, not the primary path - realtime
  // above is. This ran every 2s per member, and with four queries a tick it was
  // the single biggest source of the connection-pool exhaustion that had
  // PostgREST answering PGRST003 and 504. Ten seconds still catches a dead
  // socket long before anyone notices, and usePoll stops it entirely while the
  // tab is in the background.
  usePoll(reload, 10_000);

  const isPresentMember =
    !!profile && bonk?.status === "active" && members.some((m) => m.user_id === profile.id);

  // Presence, which also drives auto host takeover. The server reaps a member
  // as a ghost after MEMBER_TIMEOUT_MS (2 min) and steals host after
  // HOST_TIMEOUT_MS (5 min), so beating every 20s leaves six beats of margin
  // against the tighter of the two. It used to beat every 3s.
  useEffect(() => {
    if (!isPresentMember) return;
    heartbeat({ data: { bonkId: id } }).catch(() => {});
  }, [isPresentMember, id, heartbeat]);
  usePoll(
    () =>
      heartbeat({ data: { bonkId: id } }).then(
        () => true,
        () => false,
      ),
    20_000,
    isPresentMember,
    // Keeps beating in a background tab: working in another window during a
    // focus block must not read as being away.
    true,
  );

  // Warn on browser close/refresh while still in the bonk. Force-quits are
  // caught server-side by the ghost-reap in heartbeatBonk.
  const isMemberRef = useRef(false);
  useEffect(() => {
    isMemberRef.current =
      !!profile && members.some((m) => m.user_id === profile.id) && bonk?.status === "active";
  });
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isMemberRef.current) return;
      e.preventDefault();
      e.returnValue = "You're still in this bonk. Leave the bonk first before closing.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Block in-app navigation away from the bonk while the user is a member.
  useBlocker({
    shouldBlockFn: () => {
      if (!isMemberRef.current) return false;
      return !window.confirm(t("stillInBonk"));
    },
  });

  // Overdue watchdog - any member nudges the timer forward when the block
  // has run past its duration + grace, so the room doesn't get stuck at
  // 00:00 if the host disconnects.
  //
  // This used to fire every ~2s for the whole block: about 750 calls per
  // member per 25 minute focus block, every one of them a server function that
  // re-fetches jwks.json, and all but the last few guaranteed no-ops because
  // the server refuses to advance before the block is up. Now it stays quiet
  // until the block is nearly over.
  const watchdogOn =
    isPresentMember &&
    bonk?.cycle_state !== "idle" &&
    !!bonk?.cycle_started_at &&
    !bonk?.cycle_paused_at &&
    bonk?.timer_type !== "stopwatch";
  usePoll(
    () => {
      if (!bonk?.cycle_started_at) return;
      const durMs =
        ((bonk.cycle_state === "break" ? bonk.break_min : bonk.focus_min) ?? 0) * 60_000;
      const elapsed = Date.now() - new Date(bonk.cycle_started_at).getTime();
      // Wake 30s early: device clocks drift both ways, and the server does the
      // real overdue check itself (OVERDUE_GRACE_MS), so calling early is a
      // cheap no-op while calling late leaves the room stuck at 00:00.
      if (elapsed < durMs - 30_000) return;
      return advance({ data: { bonkId: id } }).then(
        () => true,
        () => false,
      );
    },
    5000,
    watchdogOn,
  );

  // Auto-restart watchdog - when finished cycles are scheduled to restart,
  // any member triggers the restart once the scheduled time arrives. Same
  // story as above: it used to poll every 1.5s from the moment the restart was
  // scheduled, a full minute of no-ops ahead of every restart.
  const restartOn = isPresentMember && !!bonk?.auto_restart && !!bonk?.restart_at;
  usePoll(
    () => {
      if (!bonk?.restart_at) return;
      if (Date.now() < new Date(bonk.restart_at).getTime() - 5000) return;
      return restartDue({ data: { bonkId: id } }).then(
        () => true,
        () => false,
      );
    },
    5000,
    restartOn,
  );

  // Tick every second so the restart countdown label refreshes.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    if (!bonk?.restart_at) return;
    const t = setInterval(() => setNowTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [bonk?.restart_at]);

  // If the host kicks/bans us, boot us out of the room. Only arm this
  // detector AFTER we've been confirmed as a member at least once -
  // otherwise a fresh join races with the first `reload()` (which fetches
  // members before our INSERT is visible) and we falsely "kick" ourselves
  // out immediately after joining.
  const kickedRef = useRef(false);
  const wasMemberRef = useRef(false);
  useEffect(() => {
    if (!profile || !bonk || bonk.status !== "active" || members.length === 0) return;
    const stillMember = members.some((m) => m.user_id === profile.id);
    if (stillMember) {
      wasMemberRef.current = true;
      return;
    }
    if (!wasMemberRef.current) return; // never confirmed yet - join still in-flight
    if (!kickedRef.current) {
      kickedRef.current = true;
      const isBanned = bans.some((b) => b.user_id === profile.id);
      toast.error(isBanned ? t("youWereBanned") : t("youWereRemoved"));
      navigate({ to: "/bonks" });
    }
  }, [profile?.id, members, bans, bonk?.status, navigate, bonk]);

  const isAdmin = useIsAdmin(!!profile);
  const isTrueHost = !!profile && !!bonk && profile.id === bonk.host_id;
  const isHost = isTrueHost || (!!bonk && isAdmin);
  const isPaused =
    !!bonk && bonk.cycle_state !== "idle" && !!bonk.cycle_started_at && !!bonk.cycle_paused_at;
  const running =
    !!bonk && bonk.cycle_state !== "idle" && !!bonk.cycle_started_at && !bonk.cycle_paused_at;
  const currentDuration =
    ((bonk?.cycle_state === "break" ? bonk?.break_min : bonk?.focus_min) ?? 25) * 60;
  const { playBreakStart, playBreakEnd } = useAlarm();
  const recordFocus = useServerFn(recordFocusCompletion);
  const startSession = useServerFn(startFocusSession);
  // Play break-start/end sounds on cycle_state transitions (fires for all members).
  // Also award XP to the local user when a focus block was substantially completed.
  const prevCycleState = useRef<Bonk["cycle_state"] | undefined>(undefined);
  const prevStartedAt = useRef<string | null | undefined>(undefined);
  // Server-issued session id for the CURRENT focus block. Keyed by cycle start
  // so reloads/reconnects still redeem the correct room cycle once it ends.
  const focusSessionRef = useRef<{ key: string; id: string | null; pending: boolean } | null>(null);
  useEffect(() => {
    const cur = bonk?.cycle_state;
    const prev = prevCycleState.current;
    const prevStart = prevStartedAt.current;
    const prevKey = bonk && prevStart ? `${bonk.id}:${prevStart}` : null;
    prevCycleState.current = cur;
    prevStartedAt.current = bonk?.cycle_started_at ?? null;
    if (!cur || prev === undefined) {
      if (cur === "focus" && profile && bonk?.cycle_started_at) {
        const key = `${bonk.id}:${bonk.cycle_started_at}`;
        if (focusSessionRef.current?.key !== key && !focusSessionRef.current?.pending) {
          focusSessionRef.current = { key, id: null, pending: true };
          startSession({ data: { kind: "bonk", bonkId: id, plannedSeconds: bonk.focus_min * 60 } })
            .then((r) => {
              focusSessionRef.current = { key, id: r.sessionId, pending: false };
            })
            .catch(() => {
              focusSessionRef.current = null;
            });
        }
      }
      return;
    }
    if (prev !== "break" && cur === "break") playBreakStart();
    else if (prev === "break" && cur !== "break") playBreakEnd();
    // Entering a new focus block: mint a server-tracked session so completion
    // XP is derived from real elapsed time server-side (no client-supplied minutes).
    if (cur === "focus" && profile && bonk?.cycle_started_at) {
      const key = `${bonk.id}:${bonk.cycle_started_at}`;
      if (focusSessionRef.current?.key !== key && !focusSessionRef.current?.pending) {
        focusSessionRef.current = { key, id: null, pending: true };
        startSession({ data: { kind: "bonk", bonkId: id, plannedSeconds: bonk.focus_min * 60 } })
          .then((r) => {
            focusSessionRef.current = { key, id: r.sessionId, pending: false };
          })
          .catch(() => {
            focusSessionRef.current = null;
          });
      }
    }
    // Leaving focus: redeem session if we ran at least 60% of the block.
    if (prev === "focus" && cur !== "focus" && profile && bonk && prevStart) {
      const elapsedSec = (Date.now() - new Date(prevStart).getTime()) / 1000;
      const focusSec = bonk.focus_min * 60;
      const sid = focusSessionRef.current?.key === prevKey ? focusSessionRef.current.id : null;
      focusSessionRef.current = null;
      if (sid && elapsedSec >= focusSec * 0.6) {
        recordFocus({ data: { sessionId: sid } })
          .then((res) => {
            prog.refresh();
            // Plain +XP/+coins toast is handled centrally by useProgression on
            // profile delta. Only add the food-awarded extra here.
            if (res.awarded) {
              const def = getFood(res.awarded.key);
              toast.success(`${def ? t(def.name) : t("food")} ${t("addedToPantry")}`);
              popMascot(`${def ? t(def.name) : t("something")} ${t("forThePantry")}`);
            }
          })
          .catch(() => {});
      }
    }
  }, [
    bonk?.cycle_state,
    bonk?.cycle_started_at,
    playBreakStart,
    playBreakEnd,
    profile,
    recordFocus,
    startSession,
    id,
    bonk,
  ]);

  const remaining = useCountdown({
    startedAt: bonk?.cycle_started_at ?? null,
    durationSec: currentDuration,
    running: running && bonk?.timer_type !== "stopwatch",
    onComplete: () => {
      if (!bonk) return;
      // Everyone nudges - the server serialises and only the winning caller
      // mutates. Non-hosts calling advance keeps the room unstuck when the
      // host's tab is throttled or offline.
      if (isHost) control({ data: { bonkId: id, action: "skip" } }).catch(() => {});
      else advance({ data: { bonkId: id } }).catch(() => {});
    },
  });
  // Stuck-at-zero watchdog: if the countdown displays 0 while still marked
  // running, aggressively poke advance + reload every 800ms until the server
  // transitions state. Backstops the 1.5s advance loop for the exact moment
  // users see "stuck at 00:00".
  useEffect(() => {
    if (!bonk || bonk.status !== "active") return;
    if (bonk.timer_type === "stopwatch") return;
    if (!running || remaining > 0) return;
    const t = setInterval(() => {
      advance({ data: { bonkId: id } }).catch(() => {});
      reload();
    }, 800);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, running, bonk?.status, bonk?.timer_type, id]);
  // When paused, freeze the displayed remaining time at the pause moment.
  const displayRemaining =
    isPaused && bonk?.cycle_started_at && bonk?.cycle_paused_at
      ? Math.max(
          0,
          Math.ceil(
            currentDuration -
              (new Date(bonk.cycle_paused_at).getTime() -
                new Date(bonk.cycle_started_at).getTime()) /
                1000,
          ),
        )
      : remaining;
  const swSec = useStopwatch({
    startedAt: bonk?.cycle_started_at ?? null,
    running: running && bonk?.timer_type === "stopwatch",
  });

  if (!bonk)
    return (
      <AppShell title="room.exe">
        <h1 className="sr-only">{t("bonkRoom")}</h1>
        <p className="label-caps p-8">{t("loadingBonk")}</p>
      </AppShell>
    );
  if (bonk.status === "ended")
    return (
      <AppShell title="room.exe">
        <div className="flex items-center justify-center p-8">
          <div className="panel flex flex-col items-center gap-4 p-12 text-center">
            <h2 className="font-display text-[32px] leading-none">{t("bonkEnded")}</h2>
            <p className="label-caps">{t("hostClosedRoom")}</p>
            <Link to="/bonks" className="btn-base btn-primary no-underline">
              {t("backToBonks")}
            </Link>
          </div>
        </div>
      </AppShell>
    );

  const isMember = !!profile && members.some((m) => m.user_id === profile.id);
  const timeText =
    bonk.timer_type === "stopwatch"
      ? formatMMSS(swSec)
      : formatMMSS(running || isPaused ? displayRemaining : currentDuration);
  const progress = bonk.timer_type === "stopwatch" ? 0 : 1 - displayRemaining / currentDuration;

  return (
    <AppShell title="room.exe">
      <div className="space-y-6 px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="label-caps truncate">
              {t(bonk.join_mode as StringKey)} · {t(bonk.timer_type as StringKey)} ·{" "}
              {String(members.length).padStart(2, "0")} {t("inTheRoom")}
            </span>
            <h1 className="flex flex-wrap items-center gap-3 font-display text-[40px] leading-none sm:text-[48px]">
              <span className="max-w-full truncate">{bonk.name}</span>
              {isHost && (
                <span className="shrink-0 border-2 border-[var(--ink)] bg-[var(--ink)] px-2 py-1 font-pixel text-[10px] uppercase tracking-[0.14em] text-[var(--bone)]">
                  {t("host")}
                </span>
              )}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="btn-base btn-tertiary gap-1.5"
              title={sidebarOpen ? t("hideMembersChat") : t("showMembersChat")}
              aria-label={sidebarOpen ? t("hideSidePanel") : t("showSidePanel")}
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {sidebarOpen ? t("hidePanel") : t("showPanel")}
              </span>
            </button>
            {isMember && !isTrueHost && (
              <button
                onClick={async () => {
                  try {
                    await leave({ data: { bonkId: id } });
                    toast.success(t("leftBonk"));
                    navigate({ to: "/bonks" });
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : t("failed"));
                  }
                }}
                className="btn-base btn-tertiary gap-2"
              >
                <LogOut className="h-4 w-4" /> {t("leave")}
              </button>
            )}
            {isHost && (
              <>
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="btn-base btn-tertiary gap-2"
                >
                  <Settings2 className="h-4 w-4" />{" "}
                  <span className="hidden sm:inline">{t("settings")}</span>
                </button>
                <button
                  onClick={() => setTransferOpen(true)}
                  className="btn-base btn-tertiary gap-2"
                >
                  <span className="hidden sm:inline">{t("transferHost")}</span>
                  <span className="sm:hidden">{t("transfer")}</span>
                </button>
                <button
                  onClick={async () => {
                    if (!window.confirm(t("endBonkConfirm"))) return;
                    try {
                      await end({ data: { bonkId: id } });
                      toast.success(t("bonkEndedToast"));
                    } catch (e: unknown) {
                      toast.error(e instanceof Error ? e.message : t("failed"));
                    }
                  }}
                  className="btn-base btn-tertiary gap-2 text-[var(--flame)]"
                >
                  <ShieldX className="h-4 w-4" />{" "}
                  <span className="hidden sm:inline">{t("endBonk")}</span>
                  <span className="sm:hidden">{t("end")}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {bonk.restart_at &&
          (() => {
            void nowTick;
            const secs = Math.max(
              0,
              Math.ceil((new Date(bonk.restart_at).getTime() - Date.now()) / 1000),
            );
            return (
              <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="font-mono text-[13px]">
                  <span>{t("cyclesComplete")}</span>{" "}
                  <span className="text-[var(--ink-soft)]">{t("restartingIn")} </span>
                  <span className="font-data">{formatMMSS(secs)}</span>
                </div>
                {isHost && (
                  <button
                    onClick={() =>
                      updateSettings({ data: { bonkId: id, autoRestart: false } }).catch(() => {})
                    }
                    className="btn-base btn-tertiary"
                  >
                    {t("cancelRestart")}
                  </button>
                )}
              </div>
            );
          })()}

        <TimerCard
          label={bonk.cycle_state === "break" ? t("breakLabel") : t("focusBlock")}
          timeText={timeText}
          progress={progress}
          cycleDots={{ total: bonk.target_cycles, current: bonk.current_cycle }}
          running={running}
          canControl={isHost}
          onStart={() => control({ data: { bonkId: id, action: running ? "pause" : "start" } })}
          onReset={() => control({ data: { bonkId: id, action: "reset" } })}
          onSkip={() => control({ data: { bonkId: id, action: "skip" } })}
          todoUserId={profile?.id ?? null}
          popoutTitle={`${t("appBonk")} · ${bonk.name}`}
          startLabel={
            running
              ? t("pause")
              : isPaused
                ? t("resume")
                : bonk.current_cycle > bonk.target_cycles
                  ? t("startNewBonk")
                  : t("startFocus")
          }
        />

        <div
          className={`grid gap-4 sm:gap-6 ${sidebarOpen ? "lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]" : "lg:grid-cols-1"}`}
        >
          {/* Main column: your todos + join requests */}
          <div className="space-y-4 sm:space-y-6 min-w-0">
            {profile && isMember && (
              <TodoList
                userId={profile.id}
                editable
                title={t("yourTodoList")}
                emptyLabel={t("addTasksForSession")}
                maxHeightClass="max-h-80"
              />
            )}
            {isHost && bonk.join_mode === "request" && (
              <section className="panel">
                <div className="titlebar">
                  <span>{t("joinRequests")}</span>
                  <span className="font-data text-[var(--bone-soft)]">
                    {String(requests.length).padStart(2, "0")}
                  </span>
                </div>
                {requests.length === 0 ? (
                  <p className="p-5 font-mono text-[13px] text-[var(--ink-soft)]">
                    {t("noPendingRequests")}
                  </p>
                ) : (
                  <ul className="flex flex-col">
                    {requests.map((r, i) => (
                      <li
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-b-0"
                        style={i % 2 === 1 ? { background: "var(--sage)" } : undefined}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <UserPlus className="h-4 w-4 shrink-0" />
                          <span className="truncate font-mono text-[13px]">{r.display_name}</span>
                          <span className="label-caps truncate">@{r.username}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => respond({ data: { requestId: r.id, accept: true } })}
                            className="btn-base btn-secondary gap-1"
                          >
                            <Check className="h-3 w-3" /> {t("accept")}
                          </button>
                          <button
                            onClick={() => respond({ data: { requestId: r.id, accept: false } })}
                            className="btn-base btn-tertiary gap-1"
                          >
                            <X className="h-3 w-3" /> {t("reject")}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          {/* Right sidebar: members list (internally scrollable) + chat */}
          {sidebarOpen && (
            <aside className="space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
              <section className="panel">
                <div className="titlebar">
                  <span>{t("members")}</span>
                  <span className="flex items-center gap-3">
                    {isHost && bans.length > 0 && (
                      <button
                        onClick={() => setBansOpen(true)}
                        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--flame)]"
                      >
                        <Ban className="h-3 w-3" /> {bans.length} {t("bannedLower")}
                      </button>
                    )}
                    <span className="font-data text-[var(--bone-soft)]">
                      {String(members.length).padStart(2, "0")}
                    </span>
                  </span>
                </div>
                <ul className="flex max-h-[22rem] flex-col overflow-y-auto">
                  {members.map((m, i) => (
                    <li
                      key={m.user_id}
                      className="border-b border-[var(--hairline)] px-4 py-3 last:border-b-0"
                      style={i % 2 === 1 ? { background: "var(--sage)" } : undefined}
                    >
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => setViewedMember(m)}
                          className="flex min-w-0 items-center gap-2 text-left"
                          title={t("viewTodoList")}
                        >
                          <AvatarPic url={m.avatar_url} name={m.display_name} size="xs" />
                          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                            {m.display_name}
                          </span>
                          <ListTodo className="h-3.5 w-3.5 opacity-40 shrink-0" />
                        </button>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-8">
                          <UserTag username={m.username} />
                          {equippedBadges[m.user_id] && (
                            <BadgeChip badgeKey={equippedBadges[m.user_id]} size="xs" />
                          )}
                          <LevelBadge xp={m.xp} username={m.username} />
                          {m.user_id === bonk.host_id && (
                            <span className="border-2 border-[var(--ink)] bg-[var(--ink)] px-1.5 py-0.5 font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--bone)]">
                              {t("hostLower")}
                            </span>
                          )}
                          {isHost && m.user_id !== bonk.host_id && (
                            <div className="flex gap-1">
                              <button
                                title={t("kickFromRoom")}
                                onClick={async () => {
                                  if (!confirm(t("kickConfirm").replace("{name}", m.display_name)))
                                    return;
                                  try {
                                    await kick({
                                      data: { bonkId: id, userId: m.user_id, ban: false },
                                    });
                                    toast.success(`${t("kicked")} ${m.display_name}`);
                                    reload();
                                  } catch (e: unknown) {
                                    toast.error(e instanceof Error ? e.message : t("failed"));
                                  }
                                }}
                                className="border-2 border-[var(--ink)] p-1"
                              >
                                <UserMinus className="h-3 w-3" />
                              </button>
                              <button
                                title={t("banFromBonk")}
                                onClick={async () => {
                                  if (!confirm(t("banConfirm").replace("{name}", m.display_name)))
                                    return;
                                  try {
                                    await kick({
                                      data: { bonkId: id, userId: m.user_id, ban: true },
                                    });
                                    toast.success(`${t("banned")} ${m.display_name}`);
                                    reload();
                                  } catch (e: unknown) {
                                    toast.error(e instanceof Error ? e.message : t("failed"));
                                  }
                                }}
                                className="border-2 border-[var(--flame)] p-1 text-[var(--flame)]"
                              >
                                <Ban className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {isMember && (
                <BonkChat
                  bonkId={id}
                  hostId={bonk.host_id}
                  chatEnabled={bonk.chat_enabled !== false}
                  slowModeSec={bonk.chat_slow_mode_sec ?? 3}
                  members={members.map((m) => ({
                    user_id: m.user_id,
                    display_name: m.display_name,
                    username: m.username,
                  }))}
                />
              )}
            </aside>
          )}
        </div>
      </div>

      {transferOpen && (
        <div
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ink)_70%,transparent)] p-4"
          onClick={() => setTransferOpen(false)}
        >
          <div className="modal-panel panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="titlebar">
              <span>{t("transferHostTo")}</span>
              <button onClick={() => setTransferOpen(false)} aria-label={t("close")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex flex-col">
              {members
                .filter((m) => m.user_id !== bonk.host_id)
                .map((m) => (
                  <li key={m.user_id}>
                    <button
                      onClick={async () => {
                        try {
                          await transfer({ data: { bonkId: id, newHostId: m.user_id } });
                          toast.success(`${t("host")} → ${m.display_name}`);
                          setTransferOpen(false);
                        } catch (e: unknown) {
                          toast.error(e instanceof Error ? e.message : t("failed"));
                        }
                      }}
                      className="w-full border-b border-[var(--hairline)] px-4 py-3 text-left"
                    >
                      <span className="font-mono text-[13px]">{m.display_name}</span>{" "}
                      <span className="label-caps">@{m.username}</span>
                    </button>
                  </li>
                ))}
              {members.filter((m) => m.user_id !== bonk.host_id).length === 0 && (
                <p className="p-5 text-center font-mono text-[13px] text-[var(--ink-soft)]">
                  {t("noOneToTransfer")}
                </p>
              )}
            </ul>
          </div>
        </div>
      )}

      {viewedMember && (
        <div
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ink)_70%,transparent)] p-4"
          onClick={() => setViewedMember(null)}
        >
          <div className="modal-panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="panel">
              <div className="titlebar">
                <span>
                  {viewedMember.user_id === profile?.id ? t("yourList") : t("publicTodoList")}
                </span>
                <button onClick={() => setViewedMember(null)} aria-label={t("close")}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-1 px-6 pt-5">
                <h3 className="font-display text-[24px] leading-none">
                  {viewedMember.display_name}
                </h3>
                <Link
                  to="/u/$username"
                  params={{ username: viewedMember.username }}
                  className="label-caps no-underline"
                >
                  @{viewedMember.username} · {t("openProfile")}
                </Link>
              </div>
              <div className="p-6">
                <TodoList
                  userId={viewedMember.user_id}
                  editable={viewedMember.user_id === profile?.id}
                  publicOnly={viewedMember.user_id !== profile?.id}
                  compact
                  title=""
                  emptyLabel={
                    viewedMember.user_id === profile?.id ? t("youHaveNoTasks") : t("noPublicTasks")
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {bansOpen && (
        <div
          className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ink)_70%,transparent)] p-4"
          onClick={() => setBansOpen(false)}
        >
          <div className="modal-panel panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="titlebar">
              <span>{t("bannedFromBonk")}</span>
              <button onClick={() => setBansOpen(false)} aria-label={t("close")}>
                <X className="h-4 w-4" />
              </button>
            </div>
            {bans.length === 0 ? (
              <p className="p-5 font-mono text-[13px] text-[var(--ink-soft)]">{t("noOneBanned")}</p>
            ) : (
              <ul className="flex flex-col">
                {bans.map((b) => (
                  <li
                    key={b.user_id}
                    className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[13px]">{b.display_name}</div>
                      <div className="label-caps truncate">@{b.username}</div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await unban({ data: { bonkId: id, userId: b.user_id } });
                          toast.success(`${t("unbanned")} ${b.display_name}`);
                          reload();
                        } catch (e: unknown) {
                          toast.error(e instanceof Error ? e.message : t("failed"));
                        }
                      }}
                      className="btn-base btn-tertiary"
                    >
                      {t("unban")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {settingsOpen && isHost && (
        <SettingsModal
          bonk={bonk}
          onClose={() => setSettingsOpen(false)}
          onSave={async (patch) => {
            try {
              await updateSettings({ data: { bonkId: id, ...patch } });
              toast.success(t("settingsUpdated"));
              setSettingsOpen(false);
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : t("failed"));
            }
          }}
        />
      )}
    </AppShell>
  );
}

type SettingsPatch = {
  focusMin?: number;
  breakMin?: number;
  targetCycles?: number;
  autoRestart?: boolean;
  chatEnabled?: boolean;
  chatSlowModeSec?: number;
  afkKick?: boolean;
};

function SettingsModal({
  bonk,
  onClose,
  onSave,
}: {
  bonk: Bonk;
  onClose: () => void;
  onSave: (p: SettingsPatch) => void;
}) {
  const { t } = useT();
  const [focusMin, setFocusMin] = useState(bonk.focus_min);
  const [breakMin, setBreakMin] = useState(bonk.break_min);
  const [targetCycles, setTargetCycles] = useState(bonk.target_cycles);
  const [autoRestart, setAutoRestart] = useState(!!bonk.auto_restart);
  const [chatEnabled, setChatEnabled] = useState(bonk.chat_enabled !== false);
  const [chatSlowModeSec, setChatSlowModeSec] = useState(bonk.chat_slow_mode_sec ?? 3);
  const [afkKick, setAfkKick] = useState(!!bonk.afk_kick);
  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[color-mix(in_srgb,var(--ink)_70%,transparent)] p-4"
      onClick={onClose}
    >
      <div className="modal-panel panel my-8 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="titlebar">
          <span>{t("bonkSettings")}</span>
          <button onClick={onClose} aria-label={t("close")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-5 p-6">
          <p className="label-caps">{t("settingsTakeEffect")}</p>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1.5">
              <div className="label-caps">{t("focusMin")}</div>
              <input
                type="number"
                min={1}
                max={120}
                value={focusMin}
                onChange={(e) =>
                  setFocusMin(Math.max(1, Math.min(120, Number(e.target.value) || 1)))
                }
                className="w-full border-2 border-[var(--ink)] bg-transparent px-2 py-1.5 text-center font-data text-[15px]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <div className="label-caps">{t("breakMin")}</div>
              <input
                type="number"
                min={0}
                max={60}
                value={breakMin}
                onChange={(e) =>
                  setBreakMin(Math.max(0, Math.min(60, Number(e.target.value) || 0)))
                }
                className="w-full border-2 border-[var(--ink)] bg-transparent px-2 py-1.5 text-center font-data text-[15px]"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <div className="label-caps">{t("cycles")}</div>
              <input
                type="number"
                min={1}
                max={20}
                value={targetCycles}
                onChange={(e) =>
                  setTargetCycles(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
                }
                className="w-full border-2 border-[var(--ink)] bg-transparent px-2 py-1.5 text-center font-data text-[15px]"
              />
            </label>
          </div>
          <label className="flex items-center gap-3 border-2 border-[var(--ink)] px-3 py-2 font-mono text-[13px]">
            <input
              type="checkbox"
              checked={autoRestart}
              onChange={(e) => setAutoRestart(e.target.checked)}
            />
            <span>{t("autoRestart")}</span>
          </label>

          <div className="flex flex-col gap-3 border-t-2 border-[var(--ink)] pt-4">
            <div className="label-caps">{t("presence")}</div>
            <label className="flex items-start gap-3 border-2 border-[var(--ink)] px-3 py-2 font-mono text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={afkKick}
                onChange={(e) => setAfkKick(e.target.checked)}
              />
              <span>
                {t("autoRemoveIdle")}
                <span className="mt-1 block text-[11px] text-[var(--ink-soft)]">
                  {t("autoRemoveIdleBlurb")}
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t-2 border-[var(--ink)] pt-4">
            <div className="label-caps">{t("chat")}</div>
            <label className="flex items-center gap-3 border-2 border-[var(--ink)] px-3 py-2 font-mono text-[13px]">
              <input
                type="checkbox"
                checked={chatEnabled}
                onChange={(e) => setChatEnabled(e.target.checked)}
              />
              <span>{t("enableRoomChat")}</span>
            </label>
            <label className={`flex flex-col gap-1.5 ${chatEnabled ? "" : "opacity-50"}`}>
              <div className="label-caps flex items-center justify-between">
                <span>{t("slowMode")}</span>
                <span className="font-data">
                  {chatSlowModeSec < 60
                    ? `${chatSlowModeSec}s`
                    : `${Math.round(chatSlowModeSec / 60)}m`}
                </span>
              </div>
              <input
                type="range"
                min={1}
                max={3600}
                value={chatSlowModeSec}
                disabled={!chatEnabled}
                onChange={(e) =>
                  setChatSlowModeSec(Math.max(1, Math.min(3600, Number(e.target.value) || 1)))
                }
                className="w-full"
              />
              <div className="label-caps flex justify-between">
                <span>1s</span>
                <span>60m</span>
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t-2 border-[var(--ink)] pt-4">
            <button onClick={onClose} className="btn-base btn-tertiary">
              {t("cancel")}
            </button>
            <button
              onClick={() =>
                onSave({
                  focusMin,
                  breakMin,
                  targetCycles,
                  autoRestart,
                  chatEnabled,
                  chatSlowModeSec,
                  afkKick,
                })
              }
              className="btn-base btn-primary"
            >
              {t("save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
