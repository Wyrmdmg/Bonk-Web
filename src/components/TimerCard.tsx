import { AlarmControls } from "@/components/AlarmControls";
import { PixelIcon } from "@/components/PixelIcon";
import { PopOut } from "@/components/PopOut";
import { TodoList } from "@/components/TodoList";
import { useT } from "@/lib/i18n";

type Props = {
  label: string;
  timeText: string;
  progress: number; // 0..1
  cycleDots?: { total: number; current: number };
  running: boolean;
  canControl: boolean;
  onStart: () => void;
  onReset: () => void;
  onSkip: () => void;
  startLabel?: string;
  /** Right-hand side of the title bar, e.g. "synced to host". */
  note?: string;
  /** Line under the controls. */
  caption?: string;
  /** Whose to-do list rides along in the pop-out. Omit to hide the pop-out. */
  todoUserId?: string | null;
  /** Pop-out window title, the room or session name. */
  popoutTitle?: string;
};

// The hero panel. One per screen: olive stock, dither, corner ticks.
// The clock is the calmest thing here, digits swap with no transition.
export function TimerCard({
  label,
  timeText,
  progress,
  cycleDots,
  running,
  canControl,
  onStart,
  onReset,
  onSkip,
  startLabel,
  note,
  caption,
  todoUserId,
  popoutTitle,
}: Props) {
  const { t } = useT();
  const pct = Math.min(100, Math.max(0, progress * 100));
  const [mm, ss] = timeText.split(":").map(Number);
  const endingSoon = running && Number.isFinite(mm) && Number.isFinite(ss) && mm === 0 && ss <= 10;
  // Spec 06: one block per 1/12 of the block, never a smooth sweep.
  const blocks = 12;
  const filled = Math.round((pct / 100) * blocks);

  return (
    <section className="panel-focus ticks relative">
      <div className="titlebar">
        <span>{label}</span>
        {cycleDots ? (
          <span className="font-data text-[var(--ink-soft)]">
            {t("cycle")} {String(cycleDots.current).padStart(2, "0")} /{" "}
            {String(cycleDots.total).padStart(2, "0")}
            {note ? ` · ${note}` : ""}
          </span>
        ) : (
          note && <span className="text-[var(--ink-soft)]">{note}</span>
        )}
      </div>

      <div className="flex flex-col gap-8 p-8 pt-10 sm:p-10 sm:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div
            className="timer-hero text-[64px] sm:text-[96px]"
            style={{ color: endingSoon ? "var(--flame)" : "var(--ink)" }}
            role="timer"
            aria-live="off"
          >
            {timeText}
          </div>
          {cycleDots && (
            <span className="label-caps text-[var(--ink-soft)]">
              {String(cycleDots.current).padStart(2, "0")} /{" "}
              {String(cycleDots.total).padStart(2, "0")} {t("blocks")}
            </span>
          )}
        </div>

        {/* Discrete blocks, never a smooth sweep. */}
        <div
          className="flex h-4 gap-[2px] border-2 border-[var(--ink)] p-[2px]"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {Array.from({ length: blocks }, (_, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ background: i < filled ? "var(--flame)" : "transparent" }}
            />
          ))}
        </div>

        {cycleDots && cycleDots.total <= 12 && (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: cycleDots.total }, (_, i) => {
              const done = i + 1 < cycleDots.current;
              const active = i + 1 === cycleDots.current;
              return (
                <div
                  key={i}
                  className="flex min-w-[64px] flex-col gap-1 border-2 border-[var(--ink)] px-2 py-1.5"
                  style={{ background: active ? "var(--flame)" : "transparent" }}
                >
                  <span
                    className="font-data text-[13px] font-medium"
                    style={{ color: active ? "#14140f" : "var(--ink)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.14em]"
                    style={{ color: active ? "#14140f" : "var(--ink-soft)" }}
                  >
                    {active ? t("running") : done ? t("done") : t("queued")}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {/* Primary, the one thing that matters now. */}
          <button onClick={onStart} disabled={!canControl} className="btn-base btn-primary">
            <PixelIcon name={running ? "pause" : "play"} size={16} />
            {startLabel ?? (running ? t("pause") : t("startFocus"))}
          </button>
          <button onClick={onSkip} disabled={!canControl} className="btn-base btn-secondary">
            {t("skipBlock")}
          </button>
          <button onClick={onReset} disabled={!canControl} className="btn-base btn-secondary">
            {t("reset")}
          </button>
          {todoUserId !== undefined && (
            <PopOut
              title={popoutTitle ?? `${t("appBonk")} · ${t("focus")}`}
              label={t("popOut")}
              className="btn-base btn-tertiary"
            >
              <FocusPopout
                label={label}
                timeText={timeText}
                running={running}
                canControl={canControl}
                onStart={onStart}
                onSkip={onSkip}
                onReset={onReset}
                startLabel={startLabel}
                todoUserId={todoUserId}
              />
            </PopOut>
          )}
        </div>

        <div className="flex">
          <AlarmControls />
        </div>

        {(caption || !canControl) && (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            {caption ?? t("hostControlsTimer")}
          </p>
        )}
      </div>
    </section>
  );
}

/** The pop-out's contents: the clock, the controls that drive it, and the list.
    Sized to the smallest thing that still reads at a glance from across a desk,
    since the window itself is meant to sit in a corner and be ignored. */
function FocusPopout({
  label,
  timeText,
  running,
  canControl,
  onStart,
  onSkip,
  onReset,
  startLabel,
  todoUserId,
}: Pick<
  Props,
  "label" | "timeText" | "running" | "canControl" | "onStart" | "onSkip" | "onReset" | "startLabel"
> & {
  todoUserId?: string | null;
}) {
  const { t } = useT();
  return (
    <div className="flex h-screen min-h-0 flex-col gap-1.5 p-1.5">
      <section className="panel-focus shrink-0 p-0">
        <div className="titlebar !py-1.5 !pl-8 text-[9px]">
          <span className="truncate">{label}</span>
        </div>
        <div className="flex flex-col gap-2 p-2.5">
          <div
            className="timer-hero text-center text-[34px] leading-none"
            role="timer"
            aria-live="off"
          >
            {timeText}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={onStart}
              disabled={!canControl}
              className="btn-base btn-primary flex-1 gap-1 px-2 py-1.5 text-[10px] tracking-[0.06em]"
            >
              <PixelIcon name={running ? "pause" : "play"} size={16} />
              {startLabel ?? (running ? t("pause") : t("startGame"))}
            </button>
            <button
              onClick={onSkip}
              disabled={!canControl}
              className="btn-base btn-secondary px-2 py-1.5 text-[10px] tracking-[0.06em]"
            >
              {t("skip")}
            </button>
            <button
              onClick={onReset}
              disabled={!canControl}
              className="btn-base btn-secondary px-2 py-1.5 text-[10px] tracking-[0.06em]"
            >
              {t("reset")}
            </button>
          </div>
        </div>
      </section>

      {todoUserId ? (
        // min-h-0 so the list scrolls inside the window instead of stretching it.
        <div className="flex min-h-0 flex-1 flex-col">
          <TodoList
            userId={todoUserId}
            editable
            title={t("tasks")}
            emptyLabel={t("addTaskAbove")}
            compact
            maxHeightClass="max-h-full"
          />
        </div>
      ) : (
        <p className="panel p-3 text-center font-mono text-[10px] text-[var(--ink-soft)]">
          {t("signInForTasks")}
        </p>
      )}
    </div>
  );
}
