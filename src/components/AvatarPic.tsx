import { useEffect, useState } from "react";
import { signAvatarPath } from "@/lib/badges.functions";
import { useServerFn } from "@tanstack/react-start";

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0]?.toUpperCase() ?? "");
}

const SIZE = {
  xs: "w-6 h-6 text-[7px]",
  sm: "w-8 h-8 text-[9px]",
  md: "w-10 h-10 text-[10px]",
  lg: "w-16 h-16 text-[14px]",
  xl: "w-24 h-24 text-[20px]",
} as const;

// Module-level cache of signed URLs by storage path. Signed URLs are minted
// for ~30 min server-side; refresh entries every 20 min to stay well ahead.
type CacheEntry = { url: string; refreshAt: number; inflight?: Promise<string | null> };
const signedCache = new Map<string, CacheEntry>();
const REFRESH_MS = 20 * 60 * 1000;

function isLikelyPath(v: string) {
  return !/^https?:\/\//i.test(v) && !v.startsWith("data:") && !v.startsWith("blob:");
}

export function AvatarPic({
  url,
  name,
  size = "sm",
  className = "",
}: {
  url?: string | null;
  name?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const cls = `${SIZE[size]} inline-flex shrink-0 items-center justify-center overflow-hidden border-2 border-[var(--ink)] bg-[var(--sage)] font-pixel uppercase ${className}`;
  const sign = useServerFn(signAvatarPath);
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!url) return null;
    if (!isLikelyPath(url)) return url;
    const c = signedCache.get(url);
    return c && c.refreshAt > Date.now() ? c.url : null;
  });

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return;
    }
    if (!isLikelyPath(url)) {
      setResolved(url);
      return;
    }
    const cached = signedCache.get(url);
    if (cached && cached.refreshAt > Date.now()) {
      setResolved(cached.url);
      return;
    }
    let cancelled = false;
    const existing = cached?.inflight;
    const p =
      existing ??
      sign({ data: { path: url } })
        .then((r) => r.url)
        .catch(() => null);
    if (!existing) {
      const entry: CacheEntry = { url: cached?.url ?? "", refreshAt: 0, inflight: p };
      signedCache.set(url, entry);
    }
    p.then((signedUrl) => {
      if (signedUrl) {
        signedCache.set(url, { url: signedUrl, refreshAt: Date.now() + REFRESH_MS });
      } else {
        signedCache.delete(url);
      }
      if (!cancelled && signedUrl) setResolved(signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [url, sign]);

  if (resolved) {
    return (
      <span className={cls}>
        <img
          src={resolved}
          alt={name ?? "avatar"}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </span>
    );
  }
  return <span className={cls}>{initials(name)}</span>;
}
