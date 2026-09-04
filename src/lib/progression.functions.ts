import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { z } from "zod";

// Award XP for completing a focus block. Minutes are derived from a
// server-tracked focus_sessions row (elapsed vs. planned) so clients cannot
// mint arbitrary XP/coins by calling this endpoint in a loop.
const RecordInput = z.object({ sessionId: z.string().uuid() });

// Kept in sync with src/lib/foods.ts. Server-side we only need the keys.
const FOOD_KEYS = [
  "chicken",
  "appleworm",
  "jam",
  "bread",
  "honey",
  "lemon",
  "shrimp",
  "sardines",
  "whiskey",
  "tomato",
  "applepie",
  "breadloaf",
  "baguette",
  "burger",
  "burrito",
  "bagel",
  "cheesecake",
  "chocolate",
  "cookies",
  "chocolatecake",
];

// Kept in sync with FOOD_CATALOG in src/lib/foods.ts. Intentionally small
// so eating snacks is a nice-to-have, not a way to grind XP.
const FOOD_XP: Record<string, number> = {
  chicken: 10,
  appleworm: 25,
  jam: 8,
  bread: 5,
  honey: 15,
  lemon: 6,
  shrimp: 9,
  sardines: 12,
  whiskey: 4,
  tomato: 20,
  applepie: 30,
  breadloaf: 18,
  baguette: 22,
  burger: 40,
  burrito: 35,
  bagel: 16,
  cheesecake: 45,
  chocolate: 28,
  cookies: 24,
  chocolatecake: 50,
};

// Shop prices - MUST stay in sync with FOOD_CATALOG.price on the client.
const FOOD_PRICE: Record<string, number> = {
  chicken: 15,
  appleworm: 40,
  jam: 12,
  bread: 8,
  honey: 22,
  lemon: 10,
  shrimp: 14,
  sardines: 18,
  whiskey: 6,
  tomato: 30,
  applepie: 45,
  breadloaf: 28,
  baguette: 34,
  burger: 60,
  burrito: 52,
  bagel: 24,
  cheesecake: 68,
  chocolate: 42,
  cookies: 36,
  chocolatecake: 75,
};

// Start a focus block. Returns a session id that recordFocusCompletion consumes.
// For bonk sessions we require the caller to actually be a member of a bonk
// whose cycle_state is 'focus', so drive-by callers can't mint sessions.
const StartInput = z.object({
  kind: z.enum(["solo", "bonk"]),
  plannedSeconds: z.number().int().min(60).max(10800),
  bonkId: z.string().uuid().optional(),
});
export const startFocusSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StartInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    let startedAt: string | undefined;
    let plannedSeconds = data.plannedSeconds;
    if (data.kind === "bonk") {
      if (!data.bonkId) throw new Error("Missing bonkId.");
      const { data: bonk } = await supabaseAdmin
        .from("bonks")
        .select("id, cycle_state, cycle_started_at, focus_min")
        .eq("id", data.bonkId)
        .maybeSingle();
      if (!bonk) throw new Error("Bonk not found.");
      if (bonk.cycle_state !== "focus") throw new Error("Not currently a focus block.");
      const { data: member } = await supabaseAdmin
        .from("bonk_members")
        .select("user_id, joined_at")
        .eq("bonk_id", data.bonkId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!member) throw new Error("You are not a member of this bonk.");
      if (!bonk.cycle_started_at) throw new Error("Focus block has not started.");
      plannedSeconds = (bonk.focus_min ?? Math.ceil(data.plannedSeconds / 60)) * 60;
      const joinedAtMs = new Date(
        (member as { joined_at?: string }).joined_at ?? bonk.cycle_started_at,
      ).getTime();
      const cycleAtMs = new Date(bonk.cycle_started_at).getTime();
      startedAt = new Date(Math.max(joinedAtMs, cycleAtMs)).toISOString();
      const { data: existing } = await supabaseAdmin
        .from("focus_sessions")
        .select("id")
        .eq("user_id", context.userId)
        .eq("kind", "bonk")
        .eq("bonk_id", data.bonkId)
        .eq("started_at", startedAt)
        .maybeSingle();
      if (existing) return { sessionId: existing.id };
    }
    // started_at is left out entirely when there is none, so the column keeps
    // its default rather than being written as null.
    const insertPayload: {
      user_id: string;
      kind: string;
      bonk_id: string | null;
      planned_seconds: number;
      started_at?: string;
    } = {
      user_id: context.userId,
      kind: data.kind,
      bonk_id: data.kind === "bonk" ? (data.bonkId ?? null) : null,
      planned_seconds: plannedSeconds,
    };
    if (startedAt) insertPayload.started_at = startedAt;
    const { data: row, error } = await supabaseAdmin
      .from("focus_sessions")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error && data.kind === "bonk" && startedAt && data.bonkId) {
      const { data: existing } = await supabaseAdmin
        .from("focus_sessions")
        .select("id")
        .eq("user_id", context.userId)
        .eq("kind", "bonk")
        .eq("bonk_id", data.bonkId)
        .eq("started_at", startedAt)
        .maybeSingle();
      if (existing) return { sessionId: existing.id };
    }
    if (error || !row) {
      console.error("[startFocusSession]", error);
      throw new Error("Could not start session.");
    }
    return { sessionId: row.id };
  });

export const recordFocusCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RecordInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    // Load & lock-in the session row. Owner-scoped + not previously awarded.
    const { data: session } = await supabaseAdmin
      .from("focus_sessions")
      .select("id, user_id, planned_seconds, started_at, awarded_at")
      .eq("id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!session) throw new Error("Session not found.");
    if (session.awarded_at) throw new Error("Session already awarded.");
    const elapsedSec = (Date.now() - new Date(session.started_at).getTime()) / 1000;
    // Minutes are the min of planned and actual elapsed (rounded down),
    // capped at 180 for parity with the previous limit.
    const usableSec = Math.min(session.planned_seconds, Math.max(0, elapsedSec));
    const minutes = Math.min(180, Math.floor(usableSec / 60));
    if (minutes < 1) throw new Error("Focus block too short to award XP.");

    // Mark awarded first with a conditional update so concurrent calls lose.
    const { data: awardedRow, error: awardErr } = await supabaseAdmin
      .from("focus_sessions")
      .update({ awarded_at: new Date().toISOString() })
      .eq("id", session.id)
      .is("awarded_at", null)
      .select("id")
      .maybeSingle();
    if (awardErr || !awardedRow) throw new Error("Session already awarded.");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("xp, coins, current_streak, longest_streak, last_focus_date")
      .eq("id", context.userId)
      .maybeSingle();
    if (!prof) throw new Error("Profile not found");

    const today = new Date().toISOString().slice(0, 10);
    const last = prof.last_focus_date ?? null;
    let streak = prof.current_streak ?? 0;
    if (last === today) {
      /* keep streak */
    } else if (last && daysBetween(last, today) === 1) streak = streak + 1;
    else streak = 1;
    const longest = Math.max(prof.longest_streak ?? 0, streak);
    const gainedXp = minutes;
    const newXp = (prof.xp ?? 0) + gainedXp;
    const streakBonus = Math.min(10, Math.floor(streak / 3));
    const gainedCoins = Math.max(1, Math.floor(gainedXp / 2) + streakBonus);
    const newCoins = (prof.coins ?? 0) + gainedCoins;

    let awarded: { key: string; name: string } | null = null;
    if (Math.random() < 0.3) {
      const key = FOOD_KEYS[Math.floor(Math.random() * FOOD_KEYS.length)];
      const { data: inserted } = await supabaseAdmin
        .from("user_foods")
        .insert({ user_id: context.userId, food_key: key })
        .select("food_key")
        .single();
      if (inserted) awarded = { key: inserted.food_key, name: inserted.food_key };
    }

    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({
        xp: newXp,
        coins: newCoins,
        current_streak: streak,
        longest_streak: longest,
        last_focus_date: today,
      })
      .eq("id", context.userId);
    if (upErr) {
      console.error("[recordFocusCompletion] update error:", upErr);
      throw new Error("Could not save progress.");
    }

    return {
      xp: newXp,
      coins: newCoins,
      gainedCoins,
      gainedXp,
      minutes,
      streak,
      longestStreak: longest,
      awarded,
    };
  });

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

const RenameInput = z.object({ userFoodId: z.string().uuid(), name: z.string().trim().max(40) });
export const renameFood = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RenameInput.parse(d))
  .handler(async ({ data, context }) => {
    const name = data.name.trim();
    const { error } = await context.supabase
      .from("user_foods")
      .update({ custom_name: name.length === 0 ? null : name })
      .eq("id", data.userFoodId)
      .eq("user_id", context.userId);
    if (error) {
      console.error("[renameFood] error:", error);
      throw new Error("Could not rename item.");
    }
    return { ok: true };
  });

// Consume a pantry item to gain its small XP perk. Cannot fail-open: we only
// award XP if the row actually got deleted (prevents double-eat races).
const EatInput = z.object({ userFoodId: z.string().uuid() });
export const eatFood = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EatInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: deleted } = await supabaseAdmin
      .from("user_foods")
      .delete()
      .eq("id", data.userFoodId)
      .eq("user_id", context.userId)
      .select("food_key")
      .maybeSingle();
    if (!deleted) throw new Error("That item is already gone.");
    const gained = FOOD_XP[deleted.food_key] ?? 5;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("xp")
      .eq("id", context.userId)
      .maybeSingle();
    const newXp = (prof?.xp ?? 0) + gained;
    await supabaseAdmin.from("profiles").update({ xp: newXp }).eq("id", context.userId);
    return { xp: newXp, gained, foodKey: deleted.food_key };
  });

// Buy a food item from the shop with coins. Server is source of truth for
// prices and balances so clients can't tamper.
const BuyInput = z.object({ foodKey: z.string().min(1).max(40) });
export const buyFood = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BuyInput.parse(d))
  .handler(async ({ data, context }) => {
    const price = FOOD_PRICE[data.foodKey];
    if (!price) throw new Error("That item isn't for sale.");
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("coins")
      .eq("id", context.userId)
      .maybeSingle();
    const balance = prof?.coins ?? 0;
    if (balance < price) throw new Error("Not enough coins.");
    const newCoins = balance - price;
    // Deduct first, then grant. If the insert fails we refund.
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ coins: newCoins })
      .eq("id", context.userId);
    if (upErr) {
      console.error("[buyFood] deduct error:", upErr);
      throw new Error("Purchase failed.");
    }
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("user_foods")
      .insert({ user_id: context.userId, food_key: data.foodKey })
      .select("id, food_key")
      .single();
    if (insErr || !inserted) {
      await supabaseAdmin.from("profiles").update({ coins: balance }).eq("id", context.userId);
      console.error("[buyFood] insert error:", insErr);
      throw new Error("Purchase failed.");
    }

    return { coins: newCoins, price, foodKey: inserted.food_key, userFoodId: inserted.id };
  });
