import badge1 from "@/assets/badges/badge_1.png";
import badge2 from "@/assets/badges/badge_2.png";
import badge3 from "@/assets/badges/badge_3.png";
import badge4 from "@/assets/badges/badge_4.png";
import badge5 from "@/assets/badges/badge_5.png";
import badge6 from "@/assets/badges/badge_6.png";
import badge7 from "@/assets/badges/badge_7.png";
import badge8 from "@/assets/badges/badge_8.png";
import type { StringKey } from "@/lib/i18n";

export type BadgeDef = {
  key: string;
  /** Translation keys, not text: the shop and the chip follow the tray. */
  name: StringKey;
  price: number; // coins
  url: string;
  perk: StringKey;
  perkKind:
    | "xp_mult"
    | "coin_mult"
    | "food_luck"
    | "streak_shield"
    | "chat_glow"
    | "focus_bonus"
    | "shop_discount"
    | "cosmetic";
  perkValue: number; // multiplier or bonus (e.g. 1.1 = +10%)
};

// Prices are intentionally steep: badges are luxury cosmetics with a small perk,
// good for one week, capped at 2 owned at a time.
export const BADGE_CATALOG: Record<string, BadgeDef> = {
  starlit: {
    key: "starlit",
    name: "badgeStarlit",
    price: 900,
    url: badge1,
    perk: "badgeStarlitPerk",
    perkKind: "xp_mult",
    perkValue: 1.1,
  },
  bloodshot: {
    key: "bloodshot",
    name: "badgeBloodshot",
    price: 950,
    url: badge2,
    perk: "badgeBloodshotPerk",
    perkKind: "coin_mult",
    perkValue: 1.15,
  },
  rage: {
    key: "rage",
    name: "badgeRage",
    price: 1100,
    url: badge3,
    perk: "badgeRagePerk",
    perkKind: "streak_shield",
    perkValue: 2,
  },
  locked_in: {
    key: "locked_in",
    name: "badgeLockedIn",
    price: 1200,
    url: badge4,
    perk: "badgeLockedInPerk",
    perkKind: "focus_bonus",
    perkValue: 1.2,
  },
  bashful: {
    key: "bashful",
    name: "badgeBashful",
    price: 800,
    url: badge5,
    perk: "badgeBashfulPerk",
    perkKind: "food_luck",
    perkValue: 2,
  },
  waver: {
    key: "waver",
    name: "badgeWaver",
    price: 750,
    url: badge6,
    perk: "badgeWaverPerk",
    perkKind: "chat_glow",
    perkValue: 1,
  },
  tearful: {
    key: "tearful",
    name: "badgeTearful",
    price: 1000,
    url: badge7,
    perk: "badgeTearfulPerk",
    perkKind: "shop_discount",
    perkValue: 0.9,
  },
  irate: {
    key: "irate",
    name: "badgeIrate",
    price: 1300,
    url: badge8,
    perk: "badgeIratePerk",
    perkKind: "cosmetic",
    perkValue: 1.1,
  },
};

export const BADGE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1 week
export const BADGE_MAX_OWNED = 2;

export function getBadge(key: string | null | undefined): BadgeDef | undefined {
  if (!key) return undefined;
  return BADGE_CATALOG[key];
}

export function formatBadgeRemaining(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}
