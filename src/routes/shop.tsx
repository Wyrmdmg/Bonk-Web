import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useT, type StringKey } from "@/lib/i18n";
import { PixelIcon } from "@/components/PixelIcon";
import { useAuth } from "@/hooks/useAuth";
import { useProgression } from "@/hooks/useProgression";
import { FOOD_CATALOG } from "@/lib/foods";
import { buyFood } from "@/lib/progression.functions";
import { BADGE_CATALOG, BADGE_MAX_OWNED, formatBadgeRemaining } from "@/lib/badges";
import { buyBadge } from "@/lib/badges.functions";
import { useMyBadges } from "@/hooks/useBadges";

function ShopPage() {
  const { t } = useT();
  const { profile } = useAuth();
  const prog = useProgression(profile?.id);
  const buy = useServerFn(buyFood);
  const buyBadgeFn = useServerFn(buyBadge);
  const [buying, setBuying] = useState<string | null>(null);
  const [buyingBadge, setBuyingBadge] = useState<string | null>(null);
  const myBadges = useMyBadges(profile?.id);
  const badges = Object.values(BADGE_CATALOG).sort((a, b) => a.price - b.price);
  const items = Object.values(FOOD_CATALOG).sort((a, b) => a.price - b.price);
  const coins = prog?.coins ?? 0;
  const ownedCount = myBadges.badges.length;
  const hasDiscount = myBadges.equipped?.badge_key === "tearful";

  const onBuy = async (key: string) => {
    if (!profile) return;
    setBuying(key);
    try {
      const res = await buy({ data: { foodKey: key } });
      toast.success(
        `${t("bought")} ${FOOD_CATALOG[key] ? t(FOOD_CATALOG[key].name) : key} · −${res.price} ${t("coins")}`,
      );
      // Instant balance refresh so the UI reflects the deduction without reload.
      prog.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("purchaseFailed"));
    } finally {
      setBuying(null);
    }
  };

  const onBuyBadge = async (key: string) => {
    if (!profile) return;
    setBuyingBadge(key);
    try {
      const res = await buyBadgeFn({ data: { badgeKey: key } });
      toast.success(
        `${t("bought")} ${BADGE_CATALOG[key] ? t(BADGE_CATALOG[key].name) : key} · −${res.price} ${t("coins")} · ${t("oneWeek")}`,
      );
      prog.refresh();
      myBadges.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("purchaseFailed"));
    } finally {
      setBuyingBadge(null);
    }
  };

  return (
    <AppShell title="shop.sh">
      <div className="px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div className="flex flex-col gap-2">
            <span className="label-caps">{t("shopTagline")}</span>
            <h1 className="font-display text-[48px] leading-none">{t("shop")}</h1>
          </div>
          {/* Coin balance, always visible. */}
          <div className="flex items-center gap-2 border-2 border-[var(--ink)] py-1 pl-1 pr-3">
            <PixelIcon name="star-gold" size={32} />
            <span className="font-data text-[18px] font-medium">{coins.toLocaleString()}</span>
            <span className="label-caps">{t("coins")}</span>
          </div>
        </header>

        {!profile && (
          <div className="panel mb-8 flex flex-wrap items-center gap-4 p-6">
            <PixelIcon name="lock-dark" size={32} />
            <div className="flex flex-1 flex-col gap-1">
              <span className="font-mono text-[15px]">{t("signInToShop")}</span>
              <span className="label-caps">{t("shopTagline")}.</span>
            </div>
            <Link to="/auth" className="btn-base btn-primary no-underline">
              {t("signIn")}
            </Link>
          </div>
        )}

        {/* Badges section - premium cosmetics with a perk, 1 week each, max 2 owned. */}
        <section className="mb-10">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[var(--ink)] pb-2">
            <h2 className="font-display text-2xl">{t("signatureBadges")}</h2>
            <span className="label-caps">
              {t("oneWeek")} · {t("maxAtATime").replace("{n}", String(BADGE_MAX_OWNED))}
              {profile ? ` · ${t("ownedLower")} ${ownedCount} / ${BADGE_MAX_OWNED}` : ""}
              {hasDiscount ? ` · ${t("tearfulDiscount")}` : ""}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {badges.map((b) => {
              const owned = myBadges.badges.find((x) => x.badge_key === b.key);
              const displayPrice = hasDiscount ? Math.round(b.price * 0.9) : b.price;
              const canAfford = coins >= displayPrice;
              const atCap = !owned && ownedCount >= BADGE_MAX_OWNED;
              const isBuying = buyingBadge === b.key;
              return (
                <article key={b.key} className="card-lift panel flex flex-col">
                  <div className="titlebar">
                    <span>{t(b.name)}</span>
                    {owned && <span className="text-[var(--bone-soft)]">{t("owned")}</span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-4 p-4">
                    <div className="sprite-frame">
                      <img
                        src={b.url}
                        alt={t(b.name)}
                        width={96}
                        height={96}
                        className="pixel"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="font-mono text-[13px] leading-snug">{t(b.perk)}</span>
                      {owned && (
                        <span className="label-caps">{formatBadgeRemaining(owned.expires_at)}</span>
                      )}
                    </div>
                    <button
                      disabled={!profile || !canAfford || isBuying || atCap}
                      onClick={() => onBuyBadge(b.key)}
                      title={atCap ? t("badgeCap").replace("{n}", String(BADGE_MAX_OWNED)) : ""}
                      className="btn-base btn-secondary w-full"
                    >
                      <span className="font-data">{displayPrice}</span>
                      <span>· {owned ? t("extend") : t("buy")}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[var(--ink)] pb-2">
            <h2 className="font-display text-2xl">{t("pantrySnacks")}</h2>
            <span className="label-caps">{t("eatForXp")}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((it) => {
              const canAfford = coins >= it.price;
              const isBuying = buying === it.key;
              return (
                <article key={it.key} className="card-lift panel flex flex-col">
                  <div className="titlebar">
                    <span className="truncate">{t(it.name)}</span>
                    <span className="font-data text-[var(--bone-soft)]">+{it.xp}</span>
                  </div>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="sprite-frame">
                      <img
                        src={it.url}
                        alt={t(it.name)}
                        width={72}
                        height={72}
                        className="pixel"
                        loading="lazy"
                      />
                    </div>
                    <p className="flex-1 font-mono text-[11px] leading-snug text-[var(--ink-soft)]">
                      {t(it.flavor)}
                    </p>
                    <button
                      disabled={!profile || !canAfford || isBuying}
                      onClick={() => onBuy(it.key)}
                      className="btn-base btn-secondary w-full"
                    >
                      <span className="font-data">{it.price}</span>
                      <span>· {t("buy")}</span>
                    </button>
                  </div>
                </article>
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
  return <div className="p-8">{t(k)}</div>;
}

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop on Bonk" },
      {
        name: "description",
        content: "Spend the coins your focus sessions earned on pantry snacks that give XP.",
      },
    ],
  }),
  component: ShopPage,
  errorComponent: () => <Msg k="shopUnavailable" />,
  notFoundComponent: () => <Msg k="notFound" />,
});
