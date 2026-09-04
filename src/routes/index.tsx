import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PetSprite } from "@/components/PixelIcon";
import { supabase } from "@/lib/supabase/client";
import { COMPANIONS } from "@/lib/companions";
import { siteUrl } from "@/lib/site";
import { useT, type StringKey } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bonk, shared focus timer" },
      {
        name: "description",
        content:
          "A shared focus timer. Start one on your own, or open a room your friends can join.",
      },
      { property: "og:title", content: "Shared focus timer" },
      {
        property: "og:description",
        content:
          "A shared focus timer. Start one on your own, or open a room your friends can join.",
      },
      { property: "og:url", content: siteUrl("/") },
    ],
    links: [{ rel: "canonical", href: siteUrl("/") }],
  }),
  component: Landing,
});

const STEPS: { n: string; title: StringKey; meta: string; body: StringKey }[] = [
  { n: "01", title: "step1Title", meta: "browse.html", body: "step1Body" },
  { n: "02", title: "step2Title", meta: "solo.exe · room.exe", body: "step2Body" },
  { n: "03", title: "step3Title", meta: "xp · coins · streaks", body: "step3Body" },
  { n: "04", title: "step4Title", meta: "shop.sh", body: "step4Body" },
];

/** Key/value row, as in the reference's SYSTEM readout. */
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-[3px] font-mono text-[12px]">
      <span className="text-[var(--ink-soft)]">{k}</span>
      <span className="font-data font-medium">{v}</span>
    </div>
  );
}

/** Continuous bar, filled to a fraction. Labelled above, as in the reference. */
function Gauge({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-caps text-[9px]">{label}</span>
      <div className="flex h-3 gap-[2px] border-2 border-[var(--ink)] p-[2px]">
        {Array.from({ length: 32 }, (_, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              background: i < Math.round((pct / 100) * 32) ? "var(--moss)" : "transparent",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/** Filled bar with two dots, a section of the window, not a window itself. */
function Section({
  file,
  title,
  note,
  children,
}: {
  file: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="section-bar">
        <span>{file}</span>
      </div>
      <h2 className="font-display text-[26px] uppercase leading-none tracking-[0.04em]">{title}</h2>
      <p className="font-mono text-[13px] leading-relaxed text-[var(--ink-soft)]">
        <span className="mr-2 font-bold text-[var(--ink)]">//</span>
        {note}
      </p>
      {children}
    </section>
  );
}

function Landing() {
  const { t } = useT();
  const [stats, setStats] = useState<{ rooms: number; people: number } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ count: rooms }, { count: people }] = await Promise.all([
        supabase.from("bonks").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      if (alive) setStats({ rooms: rooms ?? 0, people: people ?? 0 });
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <AppShell title="about.md">
      <div className="flex flex-col gap-10 px-4 py-8 sm:px-8 sm:py-10">
        {/* Intro, avatar, name, what this is, and the three ways in. */}
        <div className="flex flex-col gap-6 sm:flex-row sm:gap-7">
          <div className="sprite-frame h-fit shrink-0">
            <PetSprite file="A22_shiba.png" size={72} alt="" />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <h1 className="font-display text-[40px] uppercase leading-none tracking-[0.16em] sm:text-[48px]">
              Bonk
            </h1>
            <p className="font-mono text-[13px] leading-relaxed">
              <span className="mr-2 font-bold">//</span>
              {t("homeTagline")}
            </p>
            <p className="max-w-[640px] font-body text-[15px] leading-relaxed text-[var(--ink-soft)]">
              {t("homeBlurb")}
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link to="/bonks" className="btn-base btn-primary no-underline">
                {t("joinLiveBonk")}
              </Link>
              <Link to="/solo" className="btn-base btn-secondary no-underline">
                {t("focusAlone")}
              </Link>
              <Link to="/auth" className="btn-base btn-tertiary no-underline">
                {t("createAccount")} ↗
              </Link>
            </div>
          </div>
        </div>

        {/* SYSTEM readout, live numbers, not decoration. */}
        <div className="panel p-0">
          <div className="titlebar">
            <span>{t("system")}</span>
          </div>
          <div className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-col">
              <Row k={t("roomsLive")} v={stats ? String(stats.rooms).padStart(2, "0") : "--"} />
              <Row k={t("peopleFocusing")} v={stats ? String(stats.people) : "--"} />
              <Row k={t("account")} v={t("optional")} />
              <Row k={t("status")} v={t("online")} />
            </div>
            <Gauge label={t("focus")} pct={92} />
            <Gauge label={t("caffeine")} pct={74} />
            <Gauge label={t("bugsOpen")} pct={12} />
          </div>
        </div>

        <hr className="divider-dashed" />

        <Section file="how-it-goes.md" title={t("howItGoes")} note={t("howItGoesNote")}>
          <ol className="flex flex-col gap-6">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="mt-[5px] h-3 w-3 shrink-0 bg-[var(--flame)]" aria-hidden />
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="font-display text-[17px] leading-tight">
                    <span className="mr-2 font-data text-[var(--ink-soft)]">{s.n}</span>
                    {t(s.title)}
                  </h3>
                  <span className="font-mono text-[12px] text-[var(--ink-soft)]">{s.meta}</span>
                  <p className="mt-1 font-body text-[14px] leading-relaxed text-[var(--ink-soft)]">
                    {t(s.body)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <hr className="divider-dashed" />

        <Section file="companions.dat" title={t("raiseSomething")} note={t("companionsNote")}>
          <div className="flex flex-wrap gap-2.5">
            {COMPANIONS.slice(0, 18).map((c) => (
              <div key={c.file} className="sprite-frame">
                <PetSprite file={c.file} size={72} alt={t(c.name)} />
              </div>
            ))}
          </div>
          <Link to="/companion" className="btn-base btn-secondary w-fit no-underline">
            {t("openCompanion")}
          </Link>
        </Section>
      </div>
    </AppShell>
  );
}
