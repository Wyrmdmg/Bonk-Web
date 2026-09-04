import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { AppShell } from "@/components/AppShell";
import { UserTag } from "@/components/UserTag";
import { PixelIcon } from "@/components/PixelIcon";
import { levelFromXp } from "@/lib/leveling";
import { siteUrl } from "@/lib/site";
import { useT, type StringKey } from "@/lib/i18n";

type Row = {
  id: string;
  username: string;
  display_name: string;
  xp: number;
  current_streak: number;
  longest_streak: number;
};

type Board = "xp" | "streak" | "longest";

const BOARDS: { key: Board; label: StringKey }[] = [
  { key: "xp", label: "topXp" },
  { key: "streak", label: "currentStreak" },
  { key: "longest", label: "longestStreak" },
];

function useLeaderboard(board: Board) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const col = board === "xp" ? "xp" : board === "streak" ? "current_streak" : "longest_streak";
    supabase
      .from("profiles")
      .select("id, username, display_name, xp, current_streak, longest_streak")
      .order(col, { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (alive) {
          setRows((data as Row[]) ?? []);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [board]);
  return { rows, loading };
}

function LeaderboardPage() {
  const { t } = useT();
  const [board, setBoard] = useState<Board>("xp");
  const { rows, loading } = useLeaderboard(board);

  const unit = board === "xp" ? t("xp") : t("days");

  return (
    <AppShell title="leaderboard.log">
      <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="label-caps">{t("topFocusers")}</span>
            <h1 className="font-display text-[48px] leading-none">{t("leaderboards")}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {BOARDS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setBoard(key)}
                className={`border-2 border-[var(--ink)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] ${board === key ? "seg-on" : ""}`}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </header>

        <section className="panel">
          <div className="titlebar">
            <span>{t(BOARDS.find((b) => b.key === board)!.label)}</span>
            <span className="text-[var(--bone-soft)]">{unit}</span>
          </div>

          {loading ? (
            <p className="p-8 text-center font-mono text-[13px] text-[var(--ink-soft)]">
              {t("loading")}
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-4 p-12 text-center">
              <div className="sprite-slot">
                <PixelIcon name="trophy-dark" size={48} />
              </div>
              <h2 className="font-display text-2xl">{t("noFocusersYet")}</h2>
              <p className="label-caps">{t("beTheFirst")}</p>
            </div>
          ) : (
            <ul className="flex flex-col">
              {rows.map((r, i) => {
                const value =
                  board === "xp"
                    ? r.xp.toLocaleString()
                    : board === "streak"
                      ? String(r.current_streak)
                      : String(r.longest_streak);
                const level = levelFromXp(r.xp);
                // Gold, silver, dark, the tier set carries the ranking.
                const tier =
                  i === 0
                    ? "trophy-gold"
                    : i === 1
                      ? "trophy-silver"
                      : i === 2
                        ? "trophy-dark"
                        : null;
                return (
                  <li key={r.id} style={i % 2 === 1 ? { background: "var(--sage)" } : undefined}>
                    <Link
                      to="/u/$username"
                      params={{ username: r.username }}
                      className="flex items-center gap-4 border-b border-[var(--hairline)] px-4 py-3 no-underline last:border-b-0"
                    >
                      <span className="w-8 shrink-0 font-data text-[13px] text-[var(--ink-soft)]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="w-8 shrink-0">
                        {tier ? <PixelIcon name={tier} size={32} /> : null}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-[15px]">{r.display_name}</span>
                          <UserTag username={r.username} />
                        </div>
                        <span className="truncate label-caps">
                          @{r.username} · {t("lv")} {level}
                        </span>
                      </div>
                      <span className="whitespace-nowrap font-data text-[18px] font-medium">
                        {value}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Msg({ k }: { k: StringKey }) {
  const { t } = useT();
  return <div className="p-8">{t(k)}</div>;
}

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboards on Bonk" },
      { name: "description", content: "The top focusers on Bonk, ranked by XP and by streak." },
      { property: "og:title", content: "Leaderboards" },
      {
        property: "og:description",
        content: "The top focusers on Bonk, ranked by XP and by streak.",
      },
      { property: "og:url", content: siteUrl("/leaderboard") },
    ],
    links: [{ rel: "canonical", href: siteUrl("/leaderboard") }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Bonk Leaderboards",
          description: "The top focusers on Bonk, ranked by XP and by streak.",
          url: siteUrl("/leaderboard"),
        }),
      },
    ],
  }),
  component: LeaderboardPage,
  errorComponent: () => <Msg k="leaderboardUnavailable" />,
  notFoundComponent: () => <Msg k="notFound" />,
});
