// Client-side food catalog. Server only stores food_key; visuals + perks live here.
import Chicken from "@/assets/food/Chicken.png";
import AppleWorm from "@/assets/food/AppleWorm.png";
import Jam from "@/assets/food/Jam.png";
import Bread from "@/assets/food/Bread.png";
import Honey from "@/assets/food/Honey.png";
import Lemon from "@/assets/food/Lemon.png";
import Shrimp from "@/assets/food/Shrimp.png";
import Sardines from "@/assets/food/Sardines.png";
import Whiskey from "@/assets/food/Whiskey.png";
import Tomato from "@/assets/food/Tomato.png";
import ApplePie from "@/assets/food/apple_pie.png";
import BreadLoaf from "@/assets/food/bread_loaf.png";
import Baguette from "@/assets/food/baguette.png";
import Burger from "@/assets/food/burger.png";
import Burrito from "@/assets/food/burrito.png";
import Bagel from "@/assets/food/bagel.png";
import Cheesecake from "@/assets/food/cheesecake.png";
import Chocolate from "@/assets/food/chocolate.png";
import Cookies from "@/assets/food/cookies.png";
import ChocolateCake from "@/assets/food/chocolatecake.png";
import type { StringKey } from "@/lib/i18n";

// Perks are intentionally small - a snack, not a power-up.
// `xp` is the flat XP added when eaten. Kept in sync with server FOOD_XP map.
export type FoodDef = {
  key: string;
  /** Translation keys, not text: the shop and the pantry follow the tray. */
  name: StringKey;
  url: string;
  flavor: StringKey;
  xp: number;
  perk: StringKey;
  price: number; // coins to buy in the shop
};

// Shop prices scale with XP payout - modest markup so grinding sessions still
// beats farming pantry snacks. Kept in sync with FOOD_PRICE on the server.
export const FOOD_CATALOG: Record<string, FoodDef> = {
  chicken: {
    key: "chicken",
    name: "foodChicken",
    url: Chicken,
    xp: 10,
    price: 15,
    perk: "foodChickenPerk",
    flavor: "foodChickenFlavor",
  },
  appleworm: {
    key: "appleworm",
    name: "foodAppleworm",
    url: AppleWorm,
    xp: 25,
    price: 40,
    perk: "foodApplewormPerk",
    flavor: "foodApplewormFlavor",
  },
  jam: {
    key: "jam",
    name: "foodJam",
    url: Jam,
    xp: 8,
    price: 12,
    perk: "foodJamPerk",
    flavor: "foodJamFlavor",
  },
  bread: {
    key: "bread",
    name: "foodBread",
    url: Bread,
    xp: 5,
    price: 8,
    perk: "foodBreadPerk",
    flavor: "foodBreadFlavor",
  },
  honey: {
    key: "honey",
    name: "foodHoney",
    url: Honey,
    xp: 15,
    price: 22,
    perk: "foodHoneyPerk",
    flavor: "foodHoneyFlavor",
  },
  lemon: {
    key: "lemon",
    name: "foodLemon",
    url: Lemon,
    xp: 6,
    price: 10,
    perk: "foodLemonPerk",
    flavor: "foodLemonFlavor",
  },
  shrimp: {
    key: "shrimp",
    name: "foodShrimp",
    url: Shrimp,
    xp: 9,
    price: 14,
    perk: "foodShrimpPerk",
    flavor: "foodShrimpFlavor",
  },
  sardines: {
    key: "sardines",
    name: "foodSardines",
    url: Sardines,
    xp: 12,
    price: 18,
    perk: "foodSardinesPerk",
    flavor: "foodSardinesFlavor",
  },
  whiskey: {
    key: "whiskey",
    name: "foodWhiskey",
    url: Whiskey,
    xp: 4,
    price: 6,
    perk: "foodWhiskeyPerk",
    flavor: "foodWhiskeyFlavor",
  },
  tomato: {
    key: "tomato",
    name: "foodTomato",
    url: Tomato,
    xp: 20,
    price: 30,
    perk: "foodTomatoPerk",
    flavor: "foodTomatoFlavor",
  },
  applepie: {
    key: "applepie",
    name: "foodApplepie",
    url: ApplePie,
    xp: 30,
    price: 45,
    perk: "foodApplepiePerk",
    flavor: "foodApplepieFlavor",
  },
  breadloaf: {
    key: "breadloaf",
    name: "foodBreadloaf",
    url: BreadLoaf,
    xp: 18,
    price: 28,
    perk: "foodBreadloafPerk",
    flavor: "foodBreadloafFlavor",
  },
  baguette: {
    key: "baguette",
    name: "foodBaguette",
    url: Baguette,
    xp: 22,
    price: 34,
    perk: "foodBaguettePerk",
    flavor: "foodBaguetteFlavor",
  },
  burger: {
    key: "burger",
    name: "foodBurger",
    url: Burger,
    xp: 40,
    price: 60,
    perk: "foodBurgerPerk",
    flavor: "foodBurgerFlavor",
  },
  burrito: {
    key: "burrito",
    name: "foodBurrito",
    url: Burrito,
    xp: 35,
    price: 52,
    perk: "foodBurritoPerk",
    flavor: "foodBurritoFlavor",
  },
  bagel: {
    key: "bagel",
    name: "foodBagel",
    url: Bagel,
    xp: 16,
    price: 24,
    perk: "foodBagelPerk",
    flavor: "foodBagelFlavor",
  },
  cheesecake: {
    key: "cheesecake",
    name: "foodCheesecake",
    url: Cheesecake,
    xp: 45,
    price: 68,
    perk: "foodCheesecakePerk",
    flavor: "foodCheesecakeFlavor",
  },
  chocolate: {
    key: "chocolate",
    name: "foodChocolate",
    url: Chocolate,
    xp: 28,
    price: 42,
    perk: "foodChocolatePerk",
    flavor: "foodChocolateFlavor",
  },
  cookies: {
    key: "cookies",
    name: "foodCookies",
    url: Cookies,
    xp: 24,
    price: 36,
    perk: "foodCookiesPerk",
    flavor: "foodCookiesFlavor",
  },
  chocolatecake: {
    key: "chocolatecake",
    name: "foodChocolatecake",
    url: ChocolateCake,
    xp: 50,
    price: 75,
    perk: "foodChocolatecakePerk",
    flavor: "foodChocolatecakeFlavor",
  },
};

export const FOOD_KEYS = Object.keys(FOOD_CATALOG);
export function getFood(key: string): FoodDef | undefined {
  return FOOD_CATALOG[key];
}
