import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useT, type StringKey } from "@/lib/i18n";
import { PixelIcon, PetSprite } from "@/components/PixelIcon";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { createBonk, joinBonk } from "@/lib/bonks.functions";
import { toast } from "sonner";
import { KeyRound, X } from "lucide-react";
import { siteUrl } from "@/lib/site";

export const Route = createFileRoute("/bonks/")({
  head: () => ({
    meta: [
      { title: "Live rooms on Bonk" },
      {
        name: "description",
        content:
          "Join a room that is already running, or open one and share the timer with friends.",
      },
      { property: "og:title", content: "Live rooms" },
      {
        property: "og:description",
        content:
          "Join a room that is already running, or open one and share the timer with friends.",
      },
      { property: "og:url", content: siteUrl("/bonks") },
    ],
    links: [{ rel: "canonical", href: siteUrl("/bonks") }],
  }),
  component: BonksList,
});

type Bonk = {
  id: string;
  name: string;
  host_id: string;
  join_mode: "open" | "password" | "request";
  timer_type: string;
  focus_min: number;
  break_min: number;
  target_cycles: number;
  current_cycle: number;
  cycle_state: string;
};
type Host = { id: string; display_name: string; username: string };

function BonksList() {
  const { t } = useT();
  const { profile } = useAuth();
  const [bonks, setBonks] = useState<Bonk[]>([]);
  const [hosts, setHosts] = useState<Record<string, Host>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ bonkId: string; name: string } | null>(
    null,
  );

  // The bonk_members subscription below is unfiltered, so a burst of joins
  // anywhere on the site fires this repeatedly. One at a time.
  const loadInFlight = useRef(false);
  const load = async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      await loadOnce();
    } finally {
      loadInFlight.current = false;
    }
  };
  const loadOnce = async () => {
    const { data, error } = await supabase
      .from("bonks")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });
    // A failed query used to look identical to an empty list, so an outage
    // showed "nobody is sitting yet" instead of saying the server was down.
    setFailed(!!error);
    if (error) return;
    const rooms = (data ?? []) as Bonk[];
    setBonks(rooms);
    const hostIds = [...new Set(rooms.map((b) => b.host_id))];
    // Host names and member counts both only need the room list, so fetch
    // them together rather than one after the other. An empty `.in()` list is
    // a valid query that comes back empty.
    const [h, m] = await Promise.all([
      supabase.from("profiles").select("id, display_name, username").in("id", hostIds),
      supabase
        .from("bonk_members")
        .select("bonk_id")
        .in(
          "bonk_id",
          rooms.map((b) => b.id),
        ),
    ]);
    const map: Record<string, Host> = {};
    (h.data ?? []).forEach((pr) => {
      map[pr.id] = pr;
    });
    setHosts(map);
    const c: Record<string, number> = {};
    (m.data ?? []).forEach((r) => {
      c[r.bonk_id] = (c[r.bonk_id] ?? 0) + 1;
    });
    setCounts(c);
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const ch = supabase
      .channel("bonks-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "bonks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bonk_members" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <AppShell title="browse.html">
      <div className="px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="label-caps">
              {failed
                ? t("roomsUnavailable")
                : bonks.length === 0
                  ? t("nothingRunning")
                  : `${String(bonks.length).padStart(2, "0")} ${t("roomsRunningNow")}`}
            </span>
            <h1 className="font-display text-[48px] leading-none">{t("liveBonks")}</h1>
            <p className="font-body text-[15px] text-[var(--ink-soft)]">{t("liveBonksBlurb")}</p>
          </div>
          {profile ? (
            <button onClick={() => setShowCreate(true)} className="btn-base btn-primary">
              {t("hostABonk")}
            </button>
          ) : (
            <Link to="/auth" className="btn-base btn-secondary no-underline">
              {t("signInToHost")}
            </Link>
          )}
        </header>

        {failed ? (
          <div className="panel flex flex-col items-center gap-4 p-12 text-center">
            <h2 className="font-display text-2xl">{t("roomsUnavailable")}</h2>
            <p className="label-caps">{t("roomsUnavailableHint")}</p>
            <button
              onClick={() => {
                setFailed(false);
                load();
              }}
              className="btn-base btn-secondary"
            >
              {t("tryAgain")}
            </button>
          </div>
        ) : bonks.length === 0 ? (
          <div className="panel flex flex-col items-center gap-4 p-12 text-center">
            <div className="sprite-slot">
              <PetSprite file="C08_rabbit.png" size={72} />
            </div>
            <h2 className="font-display text-2xl">{t("nobodySitting")}</h2>
            <p className="label-caps">{profile ? t("beFirstToHost") : t("signInToHostOne")}</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bonks.map((b) => (
              <BonkCard
                key={b.id}
                bonk={b}
                host={hosts[b.host_id]}
                memberCount={counts[b.id] ?? 0}
                onJoinRequirePassword={() => setPasswordPrompt({ bonkId: b.id, name: b.name })}
              />
            ))}
          </div>
        )}
      </div>
      {showCreate && <CreateBonkModal onClose={() => setShowCreate(false)} />}
      {passwordPrompt && (
        <PasswordPromptModal {...passwordPrompt} onClose={() => setPasswordPrompt(null)} />
      )}
    </AppShell>
  );
}

function BonkCard({
  bonk,
  host,
  memberCount,
  onJoinRequirePassword,
}: {
  bonk: Bonk;
  host?: Host;
  memberCount: number;
  onJoinRequirePassword: () => void;
}) {
  const { t } = useT();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const join = useServerFn(joinBonk);
  const [joining, setJoining] = useState(false);
  return (
    <article className="card-lift panel flex flex-col">
      <div className="titlebar">
        <span className="truncate">{t(bonk.join_mode as StringKey)}</span>
        <span className="font-data text-[var(--bone-soft)]">
          {String(bonk.current_cycle).padStart(2, "0")} /{" "}
          {String(bonk.target_cycles).padStart(2, "0")}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          {bonk.join_mode === "password" && <PixelIcon name="lock-dark" size={32} />}
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="truncate font-display text-[24px] leading-none">{bonk.name}</h3>
            <span className="label-caps truncate">
              {t("host")} {host?.display_name ?? "…"} · @{host?.username ?? "…"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-[var(--hairline)] pt-3">
          <MetaRow
            label={t("mode")}
            value={`${t(bonk.timer_type as StringKey)} · ${bonk.focus_min}m`}
          />
          <MetaRow label={t("members")} value={String(memberCount).padStart(2, "0")} />
          <MetaRow
            label={t("cycle")}
            value={`${bonk.current_cycle} ${t("ofLower")} ${bonk.target_cycles}`}
          />
        </div>
        <div className="mt-auto flex justify-end pt-1">
          {profile ? (
            <button
              disabled={joining}
              onClick={async () => {
                if (bonk.join_mode === "password") {
                  onJoinRequirePassword();
                  return;
                }
                setJoining(true);
                // Optimistic navigation for open/request bonks - the room mounts
                // instantly while the join RPC completes in the background.
                if (bonk.join_mode === "open") {
                  navigate({ to: "/bonks/$id", params: { id: bonk.id } });
                }
                try {
                  const r = await join({ data: { bonkId: bonk.id } });
                  if (r.status === "requested") toast.success(t("requestSent"));
                  else if (bonk.join_mode !== "open") {
                    navigate({ to: "/bonks/$id", params: { id: bonk.id } });
                  }
                } catch (err: unknown) {
                  toast.error(err instanceof Error ? err.message : t("failed"));
                  if (bonk.join_mode === "open") navigate({ to: "/bonks" });
                } finally {
                  setJoining(false);
                }
              }}
              className="btn-base btn-primary w-full"
            >
              {joining
                ? t("joining")
                : bonk.join_mode === "request"
                  ? t("requestToJoin")
                  : t("join")}
            </button>
          ) : (
            <Link to="/auth" className="btn-base btn-primary no-underline w-full">
              {t("signInToJoin")}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="label-caps">{label}</span>
      <span className="font-data text-[13px]">{value}</span>
    </div>
  );
}

function CreateBonkModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const create = useServerFn(createBonk);
  const navigate = useNavigate();
  const [name, setName] = useState(t("focusSession"));
  const [joinMode, setJoinMode] = useState<"open" | "password" | "request">("open");
  const [password, setPassword] = useState("");
  const [timerType, setTimerType] = useState<"pomodoro" | "stopwatch" | "custom" | "interval">(
    "pomodoro",
  );
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [targetCycles, setTargetCycles] = useState(4);
  const [busy, setBusy] = useState(false);

  return (
    <Modal onClose={onClose} title={t("hostANewBonk")}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await create({
              data: {
                name,
                joinMode,
                password: joinMode === "password" ? password : undefined,
                timerType,
                focusMin,
                breakMin,
                targetCycles,
              },
            });
            toast.success(t("bonkStarted"));
            navigate({ to: "/bonks/$id", params: { id: r.id } });
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : t("failed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Labeled label={t("name")}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-data text-[15px]"
          />
        </Labeled>
        <Labeled label={t("whoCanJoin")}>
          <div className="grid grid-cols-3 gap-2">
            {(["open", "password", "request"] as const).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setJoinMode(m)}
                className={`border-2 border-[var(--ink)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] capitalize ${joinMode === m ? "seg-on" : ""}`}
              >
                {t(m as StringKey)}
              </button>
            ))}
          </div>
        </Labeled>
        {joinMode === "password" && (
          <Labeled label={t("password")}>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-data text-[15px]"
            />
          </Labeled>
        )}
        <Labeled label={t("timerType")}>
          <div className="grid grid-cols-2 gap-2">
            {(["pomodoro", "stopwatch", "custom", "interval"] as const).map((tt) => (
              <button
                type="button"
                key={tt}
                onClick={() => setTimerType(tt)}
                className={`border-2 border-[var(--ink)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] capitalize ${timerType === tt ? "seg-on" : ""}`}
              >
                {t(tt)}
              </button>
            ))}
          </div>
        </Labeled>
        <div className="grid grid-cols-3 gap-3">
          <Labeled label={t("focusMin")}>
            <input
              type="number"
              min={1}
              max={120}
              value={focusMin}
              onChange={(e) => setFocusMin(+e.target.value)}
              className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-data text-[15px]"
            />
          </Labeled>
          <Labeled label={t("breakMin")}>
            <input
              type="number"
              min={0}
              max={60}
              value={breakMin}
              onChange={(e) => setBreakMin(+e.target.value)}
              className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-data text-[15px]"
            />
          </Labeled>
          <Labeled label={t("cycles")}>
            <input
              type="number"
              min={1}
              max={20}
              value={targetCycles}
              onChange={(e) => setTargetCycles(+e.target.value)}
              className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-data text-[15px]"
            />
          </Labeled>
        </div>
        <button disabled={busy} className="btn-base btn-primary w-full">
          {busy ? t("starting") : t("startBonk")}
        </button>
      </form>
    </Modal>
  );
}

function PasswordPromptModal({
  bonkId,
  name,
  onClose,
}: {
  bonkId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const join = useServerFn(joinBonk);
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal onClose={onClose} title={`${t("join")} "${name}"`}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await join({ data: { bonkId, password } });
            if (r.status === "joined") {
              toast.success(t("joined"));
              navigate({ to: "/bonks/$id", params: { id: bonkId } });
            }
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : t("failed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Labeled label={t("password")}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-data text-[15px]"
          />
        </Labeled>
        <button disabled={busy || !password} className="btn-base btn-primary w-full">
          <KeyRound className="inline h-4 w-4 mr-1" /> {t("unlockAndJoin")}
        </button>
      </form>
    </Modal>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  const { t } = useT();
  return (
    <div
      className="modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ink)_70%,transparent)] p-4"
      onClick={onClose}
    >
      <div className="modal-panel panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="titlebar">
          <span>{title}</span>
          <button onClick={onClose} aria-label={t("close")}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="label-caps mb-1.5">{label}</div>
      {children}
    </label>
  );
}
