import { useState } from "react";
import { getBadge, formatBadgeRemaining } from "@/lib/badges";
import { useT } from "@/lib/i18n";

type Size = "xs" | "sm" | "md" | "lg";
const SIZE: Record<Size, string> = {
  xs: "w-4 h-4",
  sm: "w-5 h-5",
  md: "w-7 h-7",
  lg: "w-12 h-12",
};

export function BadgeChip({
  badgeKey,
  size = "sm",
  expiresAt,
  className = "",
}: {
  badgeKey: string | null | undefined;
  size?: Size;
  expiresAt?: string | null;
  className?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const def = getBadge(badgeKey);
  if (!def) return null;
  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      <img
        src={def.url}
        alt={t(def.name)}
        className={`${SIZE[size]} pixel`}
        style={{ imageRendering: "pixelated" }}
      />
      {open && (
        <span className="panel-ink absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap px-3 py-2 font-mono text-[11px]">
          <div className="flex items-center gap-2">
            <img src={def.url} alt="" className="w-6 h-6" style={{ imageRendering: "pixelated" }} />
            <span className="font-display">{t(def.name)}</span>
          </div>
          <div className="mt-1 text-[var(--bone-soft)]">{t(def.perk)}</div>
          {expiresAt && (
            <div className="mt-0.5 text-[10px] text-[var(--bone-soft)]">
              {formatBadgeRemaining(expiresAt)}
            </div>
          )}
        </span>
      )}
    </span>
  );
}
