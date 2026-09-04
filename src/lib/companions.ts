import type { StringKey } from "@/lib/i18n";

// Companion catalogue, drawn from the 123 sprites in public/pets/.
// A companion is raised by focusing: bond level comes from real XP.
//
// Choice and name live in localStorage, not the database. There is no
// companion schema yet, and one localStorage key is a smaller change than a
// migration + RLS policy + server fn for a feature whose shape is still moving.
// Move to a `profiles.companion_*` column set when it needs to survive a device
// change or show on someone else's profile.

export type Companion = { file: string; name: StringKey; species: StringKey; unlockLevel: number };

// A starter set, one per family. The other 117 sprites are the growth path.
export const COMPANIONS: Companion[] = [
  { file: "A22_shiba.png", name: "petShiba", species: "speciesDog", unlockLevel: 1 },
  { file: "B16_tuxedo.png", name: "petTuxedo", species: "speciesCat", unlockLevel: 1 },
  { file: "C08_rabbit.png", name: "petRabbit", species: "speciesSmallMammal", unlockLevel: 1 },
  { file: "D02_chick.png", name: "petChick", species: "speciesBird", unlockLevel: 1 },
  {
    file: "E05_commonGoldfish.png",
    name: "petCommongoldfish",
    species: "speciesFish",
    unlockLevel: 1,
  },
  { file: "F04_frog.png", name: "petFrog", species: "speciesAmphibian", unlockLevel: 1 },
  { file: "A25_welshCorgi.png", name: "petWelshcorgi", species: "speciesDog", unlockLevel: 3 },
  { file: "B02_calico.png", name: "petCalico", species: "speciesCat", unlockLevel: 3 },
  {
    file: "C04_goldenHamster.png",
    name: "petGoldenhamster",
    species: "speciesSmallMammal",
    unlockLevel: 3,
  },
  { file: "D14_zebraFinch.png", name: "petZebrafinch", species: "speciesBird", unlockLevel: 3 },
  { file: "E10_koi.png", name: "petKoi", species: "speciesFish", unlockLevel: 5 },
  { file: "F13_turtle.png", name: "petTurtle", species: "speciesReptile", unlockLevel: 5 },
  { file: "C05_hedgehog.png", name: "petHedgehog", species: "speciesSmallMammal", unlockLevel: 5 },
  { file: "B09_scottishFold.png", name: "petScottishfold", species: "speciesCat", unlockLevel: 8 },
  { file: "A18_retriever.png", name: "petRetriever", species: "speciesDog", unlockLevel: 8 },
  {
    file: "F06_leopardGecko.png",
    name: "petLeopardgecko",
    species: "speciesReptile",
    unlockLevel: 8,
  },
  { file: "D10_snowyOwl.png", name: "petSnowyowl", species: "speciesBird", unlockLevel: 12 },
  { file: "D09_eagleOwl.png", name: "petEagleowl", species: "speciesBird", unlockLevel: 12 },
  {
    file: "C01_chinchilla.png",
    name: "petChinchilla",
    species: "speciesSmallMammal",
    unlockLevel: 15,
  },
  { file: "B13_sphynx.png", name: "petSphynx", species: "speciesCat", unlockLevel: 15 },
];

// Supplies, the G set. Shop stock.
export type Supply = { file: string; name: StringKey; price: number; unlockLevel: number };

export const SUPPLIES: Supply[] = [
  { file: "G22_foodBowl.png", name: "supplyFoodbowl", price: 30, unlockLevel: 1 },
  { file: "G02_ball.png", name: "supplyBall", price: 20, unlockLevel: 1 },
  { file: "G03_bed.png", name: "supplyBed", price: 45, unlockLevel: 1 },
  { file: "G14_collar.png", name: "supplyCollar", price: 35, unlockLevel: 2 },
  { file: "G07_brush.png", name: "supplyBrush", price: 25, unlockLevel: 2 },
  { file: "G06_birdHouse.png", name: "supplyBirdhouse", price: 90, unlockLevel: 4 },
  { file: "G12_catToy.png", name: "supplyCattoy", price: 40, unlockLevel: 4 },
  { file: "G23_hamsterCage.png", name: "supplyHamstercage", price: 110, unlockLevel: 5 },
  { file: "G11_catTower.png", name: "supplyCattower", price: 120, unlockLevel: 5 },
  { file: "G25_hamsterWheel.png", name: "supplyHamsterwheel", price: 85, unlockLevel: 6 },
  { file: "G17_fishBowl.png", name: "supplyFishbowl", price: 70, unlockLevel: 6 },
  { file: "G13_catWheel.png", name: "supplyCatwheel", price: 150, unlockLevel: 8 },
  { file: "G20_fishTank.png", name: "supplyFishtank", price: 200, unlockLevel: 10 },
  { file: "G01_antFarm.png", name: "supplyAntfarm", price: 180, unlockLevel: 10 },
];

const KEY = "wd.companion";

export type CompanionState = { file: string; name: string; adopted: string };

export function readCompanion(): CompanionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<CompanionState>;
    if (!p.file || !COMPANIONS.some((c) => c.file === p.file)) return null;
    return {
      file: p.file,
      name: p.name || "Companion",
      adopted: p.adopted || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeCompanion(state: CompanionState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private window, the companion just won't persist */
  }
}

// Bond is a slower curve than account level: one bond level per 3 account levels.
export function bondFromLevel(level: number) {
  const bond = Math.max(1, Math.ceil(level / 3));
  const into = (level - 1) % 3;
  return { bond, into, span: 3 };
}
