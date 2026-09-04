import { levelFromXp } from "@/lib/leveling";
import { Link } from "@tanstack/react-router";

// The pixel font is permitted here and on the wordmark. Nowhere else.
export function LevelBadge({
  xp,
  streak,
  username,
  className = "",
}: {
  xp: number;
  streak?: number;
  username?: string;
  className?: string;
}) {
  const level = levelFromXp(xp);
  const inner = (
    <span
      className={`inline-flex items-center gap-2 border-2 border-[var(--ink)] bg-[var(--bone)] px-2 py-[7px] font-pixel text-[11px] leading-none text-[var(--ink)] ${className}`}
    >
      <span>Lv {level}</span>
      {typeof streak === "number" && streak > 0 && (
        <span className="text-[var(--flame)]" title={`${streak}-day streak`}>
          {streak}d
        </span>
      )}
    </span>
  );
  if (username)
    return (
      <Link to="/u/$username" params={{ username }} className="no-underline">
        {inner}
      </Link>
    );
  return inner;
}

// Progress fills in discrete blocks. Never a smooth gradient sweep.
export function XpBar({
  xp,
  into,
  span,
  label = true,
}: {
  xp: number;
  into: number;
  span: number;
  label?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (into / span) * 100));
  // Snap to whole blocks so the bar reads as counted, not measured.
  // Twelve is the block unit across the whole canvas (spec 06).
  const blocks = 12;
  const filled = Math.round((pct / 100) * blocks);
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <div className="flex items-baseline justify-between label-caps">
          <span>XP {xp}</span>
          <span className="font-data">
            {into} / {span}
          </span>
        </div>
      )}
      <div
        className="flex h-6 gap-[2px] border-2 border-[var(--ink)] bg-[var(--bone)] p-[2px]"
        role="progressbar"
        aria-valuenow={into}
        aria-valuemin={0}
        aria-valuemax={span}
      >
        {Array.from({ length: blocks }, (_, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ background: i < filled ? "var(--flame)" : "transparent" }}
          />
        ))}
      </div>
    </div>
  );
}
