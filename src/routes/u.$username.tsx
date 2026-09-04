import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { TodoList } from "@/components/TodoList";
import { Pantry } from "@/components/Pantry";
import { LevelBadge, XpBar } from "@/components/LevelBadge";
import { levelProgress } from "@/lib/leveling";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProgression } from "@/hooks/useProgression";
import { Flame } from "lucide-react";
import { UserTag } from "@/components/UserTag";
import { siteUrl } from "@/lib/site";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} on Bonk` },
      {
        name: "description",
        content: `Focus profile, pantry, and public to-dos for @${params.username} on Bonk. Track their XP, streaks, and public tasks.`,
      },
      { property: "og:title", content: `@${params.username}` },
      {
        property: "og:description",
        content: `Focus profile, pantry and public todos for @${params.username}.`,
      },
      { property: "og:url", content: siteUrl(`/u/${params.username}`) },
      { property: "og:type", content: "profile" },
    ],
    links: [{ rel: "canonical", href: siteUrl(`/u/${params.username}`) }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          mainEntity: {
            "@type": "Person",
            alternateName: params.username,
            url: siteUrl(`/u/${params.username}`),
          },
        }),
      },
    ],
  }),
  component: ProfilePage,
  errorComponent: ({ error }) => (
    <AppShell title="profile.md">
      <p className="label-caps p-8 text-[var(--flame)]">{error.message}</p>
    </AppShell>
  ),
  notFoundComponent: () => <NotFoundBody />,
});

function NotFoundBody() {
  const { t } = useT();
  return (
    <AppShell title="profile.md">
      <p className="label-caps p-8">{t("userNotFound")}</p>
    </AppShell>
  );
}

type P = { id: string; username: string; display_name: string };

function ProfilePage() {
  const { t } = useT();
  const { username } = Route.useParams();
  const { profile: me } = useAuth();
  const [p, setP] = useState<P | null>(null);
  const [loading, setLoading] = useState(true);
  const prog = useProgression(p?.id);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("username", username)
        .maybeSingle();
      setP((data as P | null) ?? null);
      setLoading(false);
    })();
  }, [username]);

  if (loading)
    return (
      <AppShell title="profile.md">
        <p className="label-caps p-8">{t("loading")}</p>
      </AppShell>
    );
  if (!p) throw notFound();

  const isMe = me?.id === p.id;
  const xp = prog?.xp ?? 0;
  const lp = levelProgress(xp);

  return (
    <AppShell title="profile.md">
      <div className="mx-auto w-full max-w-[1000px] space-y-8 px-4 py-8 sm:px-6">
        <section className="panel">
          <div className="titlebar">
            <span>{t("profile")}</span>
            <span className="font-data text-[var(--bone-soft)]">@{p.username}</span>
          </div>
          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h1 className="flex flex-wrap items-center gap-3 font-display text-[40px] leading-none">
                {p.display_name}
                <UserTag username={p.username} />
              </h1>
              <div className="flex items-center gap-2">
                <LevelBadge xp={xp} />
                {(prog?.currentStreak ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1.5 border-2 border-[var(--ink)] bg-[var(--flame)] px-2 py-1 text-[var(--bone)]">
                    <Flame className="h-3.5 w-3.5" />
                    <span className="font-pixel text-[10px] uppercase tracking-[0.14em]">
                      {prog?.currentStreak}d
                    </span>
                  </span>
                )}
              </div>
            </div>
            <XpBar xp={xp} into={lp.into} span={lp.span} />
            <div className="grid grid-cols-3 gap-4 text-center">
              <Stat label={t("level")} value={String(lp.level)} />
              <Stat label={t("streak")} value={`${prog?.currentStreak ?? 0}d`} />
              <Stat label={t("best")} value={`${prog?.longestStreak ?? 0}d`} />
            </div>
          </div>
        </section>

        {/* Pantries stopped being public in 20260708053057: user_foods reads
            are own-rows-only now. Showing the section to anyone else promised a
            shelf and delivered an empty one, and asked the database a question
            it answers with 401 for signed-out visitors. */}
        {isMe && (
          <section>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[var(--ink)] pb-2">
              <h2 className="font-display text-2xl">{t("pantry")}</h2>
              <span className="label-caps">{t("eatForXp")}</span>
            </div>
            <Pantry userId={p.id} editable />
          </section>
        )}

        <section>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[var(--ink)] pb-2">
            <h2 className="font-display text-2xl">{t("todo")}</h2>
            <span className="label-caps">{isMe ? t("yours") : t("publicTasksOnly")}</span>
          </div>
          <TodoList
            userId={p.id}
            editable={isMe}
            publicOnly={!isMe}
            title=""
            emptyLabel={isMe ? t("youHaveNoTasks") : t("noSharedTasks")}
          />
        </section>

        {!isMe && (
          <p className="label-caps">
            {t("onlyPublicTasks")} <Link to="/settings">{t("manageYours")}</Link>.
          </p>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-[var(--ink)] bg-[var(--sage)] py-3">
      <div className="font-data text-[24px]">{value}</div>
      <div className="label-caps mt-1">{label}</div>
    </div>
  );
}
