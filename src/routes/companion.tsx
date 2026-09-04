import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useT, type StringKey } from "@/lib/i18n";
import { PixelIcon, PetSprite } from "@/components/PixelIcon";
import { popMascot } from "@/components/MascotPopup";
import { XpBar } from "@/components/LevelBadge";
import { useAuth } from "@/hooks/useAuth";
import { useProgression } from "@/hooks/useProgression";
import { levelFromXp } from "@/lib/leveling";
import {
  COMPANIONS,
  SUPPLIES,
  bondFromLevel,
  readCompanion,
  writeCompanion,
  type CompanionState,
} from "@/lib/companions";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label-caps">{label}</span>
      <span className="font-data text-[13px]">{value}</span>
    </div>
  );
}

function CompanionPage() {
  const { lang, t } = useT();
  const { profile } = useAuth();
  const prog = useProgression(profile?.id);
  const [pet, setPet] = useState<CompanionState | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [hop, setHop] = useState(false);
  // Level at mount: anything crossing it this session is a fresh unlock.
  const baseLevel = useRef<number | null>(null);

  useEffect(() => setPet(readCompanion()), []);

  const level = levelFromXp(prog?.xp ?? 0);
  if (baseLevel.current === null && prog) baseLevel.current = level;
  const justUnlocked = (need: number) =>
    baseLevel.current !== null && need > baseLevel.current && need <= level;
  const { bond, into, span } = bondFromLevel(level);

  const adopt = (file: string, name: string) => {
    const next = { file, name, adopted: new Date().toISOString() };
    writeCompanion(next);
    setPet(next);
    setHop(true);
    toast.success(`${name} ${t("isNowCompanion")}`);
    popMascot(`${name} ${t("movedIn")}`);
  };

  const rename = () => {
    const name = draft.trim().slice(0, 20);
    if (!pet || !name) return setRenaming(false);
    const next = { ...pet, name };
    writeCompanion(next);
    setPet(next);
    setRenaming(false);
    toast.success(t("renamed"));
  };

  const active = pet ? COMPANIONS.find((c) => c.file === pet.file) : null;

  return (
    <AppShell title="companion.dat">
      <div className="px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="label-caps">
              {pet
                ? `${t("yourCompanion")} · ${t("raisedAlongside")} ${prog?.xp ?? 0} ${t("xp")}`
                : t("noCompanionYet")}
            </span>
            <h1 className="font-display text-[32px] leading-none">{pet?.name ?? t("companion")}</h1>
          </div>
          <Link to="/shop" className="btn-base btn-secondary no-underline">
            {t("openShop")}
          </Link>
        </header>

        {!pet ? (
          // Empty state: one sprite, one bold line, one action.
          <section className="panel p-12">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="sprite-slot">
                <PetSprite file="C08_rabbit.png" size={144} />
              </div>
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-2xl">{t("nobodyHereYet")}</h2>
                <p className="label-caps">{t("pickCompanion")}</p>
              </div>
            </div>
          </section>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
            {/* Hero, the companion itself. One focus panel per screen. */}
            <section className="panel-focus ticks relative">
              <div className="titlebar">
                <span>{active ? t(active.species) : t("companion")}</span>
                <span className="text-[var(--ink-soft)]">
                  {t("bond")} {t("lv")} {bond}
                </span>
              </div>
              <div className="flex flex-col items-center gap-6 p-10 pt-12">
                <PetSprite
                  file={pet.file}
                  size={144}
                  className={hop ? "sprite-hop" : "sprite-idle"}
                  alt={pet.name}
                  onAnimationEnd={() => setHop(false)}
                />
                <div className="flex flex-col items-center gap-2">
                  {renaming ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={draft}
                        maxLength={20}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") rename();
                          if (e.key === "Escape") setRenaming(false);
                        }}
                        className="border-2 border-[var(--ink)] bg-transparent px-3 py-1.5 font-mono text-[15px] text-[var(--ink)]"
                      />
                      <button onClick={rename} className="btn-tertiary text-[var(--ink)]">
                        {t("save")}
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-display text-[32px] leading-none text-[var(--ink)]">
                        {pet.name}
                      </span>
                      <button
                        onClick={() => {
                          setDraft(pet.name);
                          setRenaming(true);
                        }}
                        className="btn-tertiary text-[var(--ink-soft)]"
                      >
                        {t("rename")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            {/* Metadata, label/value rows, scannable. */}
            <section className="panel">
              <div className="titlebar">
                <span>{t("record")}</span>
                <span className="text-[var(--ink-soft)]">
                  {t("bond")} {into} / {span}
                </span>
              </div>
              <div className="flex flex-col gap-6 p-6">
                <XpBar xp={prog?.xp ?? 0} into={into} span={span} label={false} />
                <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                  <Stat label={t("species")} value={active ? t(active.species) : "n/a"} />
                  <Stat label={t("sprite")} value={pet.file.replace(".png", "")} />
                  <Stat
                    label={t("adopted")}
                    value={new Date(pet.adopted).toLocaleDateString(lang)}
                  />
                  <Stat label={t("accountLevel")} value={`${t("lv")} ${level}`} />
                  <Stat
                    label={t("streak")}
                    value={`${prog?.currentStreak ?? 0} ${t("daysLower")}`}
                  />
                  <Stat
                    label={t("longestStreak")}
                    value={`${prog?.longestStreak ?? 0} ${t("daysLower")}`}
                  />
                </div>
                <p className="border-t border-[var(--hairline)] pt-4 font-mono text-[11px] leading-relaxed text-[var(--ink-soft)]">
                  {t("bondBlurb")}
                </p>
              </div>
            </section>
          </div>
        )}

        {/* Supplies */}
        <section className="mt-8">
          <div className="mb-4 flex items-baseline justify-between border-b-2 border-[var(--ink)] pb-2">
            <h2 className="font-display text-2xl">{t("supplies")}</h2>
            <span className="label-caps">
              {t("unlockedByLevel")} · {SUPPLIES.filter((s) => level >= s.unlockLevel).length} /{" "}
              {SUPPLIES.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
            {SUPPLIES.map((s) => {
              const locked = level < s.unlockLevel;
              return (
                <div key={s.file} className="flex flex-col gap-2">
                  <div className={locked ? "sprite-slot relative" : "sprite-frame relative"}>
                    <PetSprite
                      file={s.file}
                      size={72}
                      className={locked ? "opacity-25" : ""}
                      alt={t(s.name)}
                    />
                    <span className="absolute right-1 top-1">
                      <PixelIcon
                        name={locked ? "lock-silver" : "unlock-gold"}
                        size={16}
                        className={justUnlocked(s.unlockLevel) ? "icon-pop" : ""}
                      />
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[13px] leading-tight">{t(s.name)}</span>
                    <span className="label-caps">
                      {locked ? `${t("lv")} ${s.unlockLevel}` : `${s.price} ${t("coins")}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Roster */}
        <section className="mt-10">
          <div className="mb-4 flex items-baseline justify-between border-b-2 border-[var(--ink)] pb-2">
            <h2 className="font-display text-2xl">{t("companions")}</h2>
            <span className="label-caps">
              {COMPANIONS.filter((c) => level >= c.unlockLevel).length} {t("ofLower")}{" "}
              {COMPANIONS.length} {t("unlockedLower")}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {COMPANIONS.map((c) => {
              const locked = level < c.unlockLevel;
              const isActive = pet?.file === c.file;
              return (
                <button
                  key={c.file}
                  disabled={locked}
                  onClick={() => adopt(c.file, t(c.name))}
                  className="flex flex-col gap-2 text-left disabled:cursor-not-allowed"
                >
                  <div
                    className={`${locked ? "sprite-slot" : "sprite-frame"} relative`}
                    style={
                      isActive
                        ? { outline: "2px solid var(--flame)", outlineOffset: "2px" }
                        : undefined
                    }
                  >
                    <PetSprite
                      file={c.file}
                      size={72}
                      className={locked ? "opacity-25" : ""}
                      alt={t(c.name)}
                    />
                    <span className="absolute right-1 top-1">
                      <PixelIcon
                        name={locked ? "lock-silver" : "unlock-gold"}
                        size={16}
                        className={justUnlocked(c.unlockLevel) ? "icon-pop" : ""}
                      />
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[13px] leading-tight">{t(c.name)}</span>
                    <span className="label-caps">
                      {locked
                        ? `${t("lv")} ${c.unlockLevel}`
                        : isActive
                          ? t("active")
                          : t(c.species)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Msg({ k }: { k: StringKey }) {
  const { t } = useT();
  return <div className="p-8 font-mono">{t(k)}</div>;
}

export const Route = createFileRoute("/companion")({
  head: () => ({
    meta: [
      { title: "Companion on Bonk" },
      {
        name: "description",
        content:
          "Raise a study companion. Focus sessions grow your bond and unlock new companions and supplies.",
      },
    ],
  }),
  component: CompanionPage,
  errorComponent: () => <Msg k="companionUnavailable" />,
  notFoundComponent: () => <Msg k="notFound" />,
});
