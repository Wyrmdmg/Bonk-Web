import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useT, type StringKey } from "@/lib/i18n";
import { TimerCard } from "@/components/TimerCard";
import { TodoList } from "@/components/TodoList";
import { formatMMSS, useCountdown, useStopwatch } from "@/hooks/useTimer";
import { useAlarm } from "@/hooks/useAlarm";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { recordFocusCompletion, startFocusSession } from "@/lib/progression.functions";
import { getFood } from "@/lib/foods";
import { toast } from "sonner";
import { popMascot } from "@/components/MascotPopup";
import {
  resetSoloSession,
  setSoloSession,
  useSoloSession,
  type SoloMode,
} from "@/hooks/useSoloSession";
import { useProgression } from "@/hooks/useProgression";
import { siteUrl } from "@/lib/site";

export const Route = createFileRoute("/solo")({
  head: () => ({
    meta: [
      { title: "Solo focus on Bonk" },
      {
        name: "description",
        content: "A timer of your own for deep work. No account needed to start one.",
      },
      { property: "og:title", content: "Solo focus" },
      {
        property: "og:description",
        content: "A timer of your own for deep work. No account needed to start one.",
      },
      { property: "og:url", content: siteUrl("/solo") },
    ],
    links: [{ rel: "canonical", href: siteUrl("/solo") }],
  }),
  component: Solo,
});

function Solo() {
  const { t } = useT();
  const { profile } = useAuth();
  const prog = useProgression(profile?.id);
  const session = useSoloSession();
  const {
    mode,
    focusMin,
    breakMin,
    targetCycles,
    currentCycle,
    state,
    startedAt,
    pausedAt,
    focusSessionId,
  } = session;
  const { playBreakStart, playBreakEnd } = useAlarm();
  const recordFocus = useServerFn(recordFocusCompletion);
  const startSession = useServerFn(startFocusSession);
  const awardXp = async (sessionId: string | null) => {
    if (!profile || !sessionId) return;
    try {
      const res = await recordFocus({ data: { sessionId } });
      prog.refresh();
      if (res.awarded) {
        const def = getFood(res.awarded.key);
        toast.success(`${def ? t(def.name) : t("food")} ${t("addedToPantry")}`);
      }
      // Plain +XP/+coins toast is handled centrally by useProgression on delta.
    } catch {
      /* silent */
    }
  };
  // Fire-and-forget: start a server-tracked focus session on entering focus.
  const beginFocus = async (plannedSeconds: number) => {
    if (!profile) return null;
    try {
      const { sessionId } = await startSession({ data: { kind: "solo", plannedSeconds } });
      return sessionId;
    } catch {
      return null;
    }
  };

  const durationSec = state === "break" ? breakMin * 60 : focusMin * 60;
  const remaining = useCountdown({
    startedAt,
    durationSec,
    running: state !== "idle" && !pausedAt && mode !== "stopwatch",
    onComplete: () => {
      if (state === "focus" && breakMin > 0 && mode === "pomodoro") {
        playBreakStart();
        awardXp(focusSessionId);
        toast.success(t("focusCompleteBreak"));
        popMascot(t("blockDoneStretch"));
        setSoloSession({
          state: "break",
          startedAt: new Date().toISOString(),
          pausedAt: null,
          focusSessionId: null,
        });
      } else {
        if (state === "break") playBreakEnd();
        if (state === "focus") awardXp(focusSessionId);
        const next = currentCycle + 1;
        if (next > targetCycles) {
          toast.success(t("allCyclesDone"));
          popMascot(t("everyCycleDone"), "scarf");
          setSoloSession({
            state: "idle",
            startedAt: null,
            pausedAt: null,
            currentCycle: 1,
            focusSessionId: null,
          });
        } else {
          setSoloSession({
            currentCycle: next,
            state: "focus",
            startedAt: new Date().toISOString(),
            pausedAt: null,
            focusSessionId: null,
          });
          beginFocus(focusMin * 60).then((sid) => {
            if (sid) setSoloSession({ focusSessionId: sid });
          });
          toast.success(`${t("cycle")} ${next}`);
        }
      }
    },
  });
  const displayRemaining =
    pausedAt && startedAt
      ? Math.max(
          0,
          Math.ceil(
            durationSec - (new Date(pausedAt).getTime() - new Date(startedAt).getTime()) / 1000,
          ),
        )
      : remaining;
  const swSec = useStopwatch({
    startedAt,
    running: state === "focus" && !pausedAt && mode === "stopwatch",
  });

  const timeText =
    mode === "stopwatch"
      ? formatMMSS(swSec)
      : formatMMSS(state === "idle" ? durationSec : displayRemaining);
  const progress = mode === "stopwatch" ? 0 : 1 - displayRemaining / durationSec;

  const locked = state !== "idle";

  return (
    <AppShell title="solo.exe">
      <div className="flex flex-col gap-8 px-4 py-8 sm:px-6">
        <h1 className="sr-only">{t("soloFocusTimer")}</h1>

        <TimerCard
          label={mode === "pomodoro" ? t("focusBlock") : t(mode as StringKey).toUpperCase()}
          timeText={timeText}
          progress={progress}
          cycleDots={
            mode !== "stopwatch" ? { total: targetCycles, current: currentCycle } : undefined
          }
          running={state !== "idle" && !pausedAt}
          canControl
          onStart={() => {
            if (state === "idle") {
              setSoloSession({
                state: "focus",
                startedAt: new Date().toISOString(),
                pausedAt: null,
                focusSessionId: null,
              });
              if (mode !== "stopwatch") {
                beginFocus(focusMin * 60).then((sid) => {
                  if (sid) setSoloSession({ focusSessionId: sid });
                });
              }
            } else if (pausedAt && startedAt) {
              // Resume: shift startedAt forward by paused duration
              const pausedMs = Date.now() - new Date(pausedAt).getTime();
              setSoloSession({
                startedAt: new Date(new Date(startedAt).getTime() + pausedMs).toISOString(),
                pausedAt: null,
              });
            } else {
              // Pause
              setSoloSession({ pausedAt: new Date().toISOString() });
            }
          }}
          todoUserId={profile?.id ?? null}
          popoutTitle={`${t("appBonk")} · ${t("soloFocus")}`}
          onReset={() => resetSoloSession()}
          onSkip={() => {
            if (state === "focus" && breakMin > 0 && mode === "pomodoro") {
              playBreakStart();
              if (focusSessionId) awardXp(focusSessionId);
              setSoloSession({
                state: "break",
                startedAt: new Date().toISOString(),
                pausedAt: null,
                focusSessionId: null,
              });
            } else {
              if (state === "break") playBreakEnd();
              if (state === "focus" && focusSessionId) awardXp(focusSessionId);
              const next = currentCycle + 1;
              if (next > targetCycles) {
                setSoloSession({
                  state: "idle",
                  startedAt: null,
                  pausedAt: null,
                  currentCycle: 1,
                  focusSessionId: null,
                });
              } else {
                setSoloSession({
                  currentCycle: next,
                  state: "focus",
                  startedAt: new Date().toISOString(),
                  pausedAt: null,
                  focusSessionId: null,
                });
                beginFocus(focusMin * 60).then((sid) => {
                  if (sid) setSoloSession({ focusSessionId: sid });
                });
              }
            }
          }}
        />

        <div className="grid gap-8 xl:grid-cols-[320px_1fr]">
          <aside className="panel h-fit">
            <div className="titlebar">
              <span>{t("session")}</span>
              {locked && <span className="text-[var(--bone-soft)]">{t("lockedWhileRunning")}</span>}
            </div>
            <div className="flex flex-col gap-6 p-6">
              <div className="flex flex-col gap-2">
                <span className="label-caps">{t("timerType")}</span>
                <div className="grid grid-cols-2 gap-2">
                  {(["pomodoro", "interval", "custom", "stopwatch"] as SoloMode[]).map((m) => (
                    <button
                      key={m}
                      disabled={locked}
                      onClick={() =>
                        setSoloSession({ mode: m, state: "idle", startedAt: null, pausedAt: null })
                      }
                      className={`border-2 border-[var(--ink)] px-3 py-2 text-left font-mono text-[11px] uppercase tracking-[0.14em] capitalize disabled:opacity-40 ${mode === m ? "seg-on" : ""}`}
                    >
                      {t(m as StringKey)}
                    </button>
                  ))}
                </div>
              </div>

              {mode !== "stopwatch" && (
                <Stepper
                  label={t("focus")}
                  unit={t("min")}
                  value={focusMin}
                  min={1}
                  max={120}
                  disabled={locked}
                  presets={[15, 25, 50, 90]}
                  onChange={(v) => setSoloSession({ focusMin: v })}
                />
              )}
              {mode === "pomodoro" && (
                <Stepper
                  label={t("breakLabel")}
                  unit={t("min")}
                  value={breakMin}
                  min={0}
                  max={60}
                  disabled={locked}
                  onChange={(v) => setSoloSession({ breakMin: v })}
                />
              )}
              {mode !== "stopwatch" && mode !== "custom" && (
                <Stepper
                  label={t("cycles")}
                  note={`${currentCycle - 1} ${t("doneLower")}`}
                  value={targetCycles}
                  min={1}
                  max={20}
                  disabled={locked}
                  onChange={(v) => setSoloSession({ targetCycles: v })}
                />
              )}

              <div className="flex flex-col gap-3 border-t-2 border-[var(--ink)] pt-5">
                <span className="label-caps">{t("today")}</span>
                <div className="flex flex-col gap-2">
                  <Row
                    label={t("streak")}
                    value={`${prog?.currentStreak ?? 0} ${t("daysLower")}`}
                  />
                  <Row label={t("coins")} value={String(prog?.coins ?? 0)} />
                  <Row label={t("xp")} value={String(prog?.xp ?? 0)} />
                </div>
              </div>
            </div>
          </aside>

          {profile ? (
            <TodoList
              userId={profile.id}
              editable
              title={t("yourTodoList")}
              emptyLabel={t("addFirstTask")}
            />
          ) : (
            <div className="panel p-6 text-center font-mono text-[13px] text-[var(--ink-soft)]">
              {t("signInForTodo")}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="label-caps">{label}</span>
      <span className="font-data text-[13px]">{value}</span>
    </div>
  );
}

// Numeric field with hard −/+ steppers. Mono, tabular, no slider.
function Stepper({
  label,
  unit,
  note,
  value,
  min,
  max,
  disabled,
  presets,
  onChange,
}: {
  label: string;
  unit?: string;
  note?: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  presets?: number[];
  onChange: (v: number) => void;
}) {
  const { t } = useT();
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="label-caps">
          {label}
          {unit ? ` · ${unit}` : ""}
        </span>
        {note && <span className="label-caps">{note}</span>}
      </div>
      <div className="flex items-stretch border-2 border-[var(--ink)]">
        <button
          disabled={disabled}
          onClick={() => onChange(clamp(value - 1))}
          className="grid w-10 place-items-center border-r-2 border-[var(--ink)] disabled:opacity-40"
          aria-label={`${t("decrease")} ${label}`}
        >
          −
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(clamp(+e.target.value))}
          className="w-full bg-transparent px-3 py-2 text-center font-data text-[15px] disabled:opacity-40"
        />
        <button
          disabled={disabled}
          onClick={() => onChange(clamp(value + 1))}
          className="grid w-10 place-items-center border-l-2 border-[var(--ink)] disabled:opacity-40"
          aria-label={`${t("increase")} ${label}`}
        >
          +
        </button>
      </div>
      {presets && (
        <div className="flex gap-2">
          {presets.map((p) => (
            <button
              key={p}
              disabled={disabled}
              onClick={() => onChange(clamp(p))}
              className={`flex-1 border-2 border-[var(--ink)] py-1 font-data text-[11px] disabled:opacity-40 ${value === p ? "seg-on" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
