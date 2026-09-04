import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { z } from "zod";

// Server is source of truth for prices, durations, and the 2-owned cap.
// Keep in sync with src/lib/badges.ts.
const BADGE_PRICES: Record<string, number> = {
  starlit: 900,
  bloodshot: 950,
  rage: 1100,
  locked_in: 1200,
  bashful: 800,
  waver: 750,
  tearful: 1000,
  irate: 1300,
};
const BADGE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const BADGE_MAX_OWNED = 2;

const BuyBadgeInput = z.object({ badgeKey: z.string().min(1).max(40) });

export const buyBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BuyBadgeInput.parse(d))
  .handler(async ({ data, context }) => {
    const price = BADGE_PRICES[data.badgeKey];
    if (!price) throw new Error("That badge isn't for sale.");
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");

    // Discount if user currently equips the "tearful" badge (10% off).
    const nowIso = new Date().toISOString();
    const { data: equipped } = await supabaseAdmin
      .from("user_badges")
      .select("badge_key, expires_at")
      .eq("user_id", context.userId)
      .eq("equipped", true)
      .gt("expires_at", nowIso)
      .maybeSingle();
    let finalPrice = price;
    if (equipped?.badge_key === "tearful") finalPrice = Math.round(price * 0.9);

    // Enforce the owned cap on non-expired badges.
    const { data: owned } = await supabaseAdmin
      .from("user_badges")
      .select("id, badge_key, expires_at")
      .eq("user_id", context.userId)
      .gt("expires_at", nowIso);
    const activeOwned = owned ?? [];
    const alreadyHas = activeOwned.find((b) => b.badge_key === data.badgeKey);
    if (!alreadyHas && activeOwned.length >= BADGE_MAX_OWNED) {
      throw new Error(
        `You can only own ${BADGE_MAX_OWNED} badges at a time. Wait for one to expire or unequip it.`,
      );
    }

    // Charge coins.
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("coins")
      .eq("id", context.userId)
      .maybeSingle();
    const balance = prof?.coins ?? 0;
    if (balance < finalPrice) throw new Error("Not enough coins.");
    const newCoins = balance - finalPrice;

    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ coins: newCoins })
      .eq("id", context.userId);
    if (upErr) {
      console.error("[buyBadge] deduct:", upErr);
      throw new Error("Purchase failed.");
    }

    // Insert or extend: if the user already owns this badge (non-expired),
    // stack another week on top; otherwise fresh 7-day term.
    const baseTime = alreadyHas
      ? Math.max(new Date(alreadyHas.expires_at).getTime(), Date.now())
      : Date.now();
    const newExpires = new Date(baseTime + BADGE_DURATION_MS).toISOString();

    const { error: insErr } = await supabaseAdmin.from("user_badges").upsert(
      {
        user_id: context.userId,
        badge_key: data.badgeKey,
        expires_at: newExpires,
        purchased_at: new Date().toISOString(),
      },
      { onConflict: "user_id,badge_key" },
    );
    if (insErr) {
      // refund
      await supabaseAdmin.from("profiles").update({ coins: balance }).eq("id", context.userId);
      console.error("[buyBadge] insert:", insErr);
      throw new Error("Purchase failed.");
    }

    return { coins: newCoins, price: finalPrice, badgeKey: data.badgeKey, expiresAt: newExpires };
  });

const EquipInput = z.object({ badgeKey: z.string().max(40) });
export const equipBadge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EquipInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { error: clearErr } = await supabaseAdmin
      .from("user_badges")
      .update({ equipped: false })
      .eq("user_id", context.userId)
      .eq("equipped", true);
    if (clearErr) {
      console.error("[equipBadge clear]:", clearErr);
      throw new Error("Could not equip badge.");
    }
    if (!data.badgeKey) return { ok: true };
    const { data: updated, error } = await supabaseAdmin
      .from("user_badges")
      .update({ equipped: true })
      .eq("user_id", context.userId)
      .eq("badge_key", data.badgeKey)
      .gt("expires_at", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (error || !updated) {
      console.error("[equipBadge]:", error);
      throw new Error("You do not own this active badge.");
    }
    return { ok: true };
  });

// Accepts a storage path (preferred) or null to clear. We store only the
// object path in profiles.avatar_url and sign it on demand via signAvatarPath,
// so no long-lived bypass token leaks into public profile reads.
const AvatarInput = z.object({ avatarPath: z.string().max(512).nullable() });
export const updateAvatarUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AvatarInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.avatarPath && !data.avatarPath.startsWith(`${context.userId}/`)) {
      throw new Error("Invalid avatar path.");
    }
    // Use supabaseAdmin: the profiles UPDATE grant for `authenticated` is
    // column-scoped to `status` only (see profiles hardening migration), so
    // the user-scoped client can't write avatar_url. We already verified
    // the caller owns the path prefix above.
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: data.avatarPath })
      .eq("id", context.userId);
    if (error) {
      console.error("[updateAvatarUrl]:", error);
      throw new Error("Could not save avatar.");
    }
    return { ok: true };
  });

// Signs a stored avatar path with a short TTL. Private bucket contents are
// only accessible via a fresh signed URL minted for an authenticated caller.
const SignInput = z.object({ path: z.string().min(1).max(512) });
export const signAvatarPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SignInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUrl(data.path, 60 * 30);
    if (error || !signed?.signedUrl) throw new Error("Could not sign avatar URL.");
    return { url: signed.signedUrl };
  });

const UploadAvatarInput = z.object({ dataUrl: z.string().min(20).max(4_500_000) });
export const uploadAvatarImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadAvatarInput.parse(d))
  .handler(async ({ data, context }) => {
    // JPEG only. The settings page re-encodes every pick through a canvas, so
    // anything the browser can open still gets here, and one format means the
    // scanner below always has something it can decode.
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(data.dataUrl);
    if (!match) throw new Error("Please pick an image file.");
    const base64 = match[1];
    const mime = "image/jpeg";
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    if (bytes.byteLength > 3 * 1024 * 1024) throw new Error("Image must be under 3 MB.");

    // Screened before it is stored, so a refused picture never exists on disk
    // and never has a URL that could be handed around.
    const { scanImage } = await import("@/lib/moderation.server");
    const verdict = await scanImage(bytes, base64);
    if (!verdict.ok) {
      console.warn("[uploadAvatarImage] refused", context.userId, verdict.by, verdict.reason);
      throw new Error(
        verdict.by === "none"
          ? "Profile pictures are paused: the content scanner is unavailable."
          : "That picture was refused by the content filter. Please pick another one.",
      );
    }

    const path = `${context.userId}/avatar-${Date.now()}.jpg`;
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const store = () =>
      supabaseAdmin.storage.from("avatars").upload(path, new Blob([bytes], { type: mime }), {
        cacheControl: "31536000",
        upsert: true,
        contentType: mime,
      });
    let { error: upErr } = await store();
    // The bucket is declared in a migration, but a project restored without it
    // answers "Bucket not found" for every user, which is exactly how this broke.
    // Make it, once, rather than leaving uploads dead until someone notices.
    if (upErr && /bucket not found/i.test(upErr.message ?? "")) {
      const { error: mkErr } = await supabaseAdmin.storage.createBucket("avatars", {
        public: false,
        fileSizeLimit: 3 * 1024 * 1024,
        allowedMimeTypes: [mime],
      });
      if (mkErr && !/already exists/i.test(mkErr.message ?? "")) {
        console.error("[uploadAvatarImage] createBucket:", mkErr);
      }
      ({ error: upErr } = await store());
    }
    if (upErr) {
      console.error("[uploadAvatarImage] upload:", upErr);
      throw new Error("Could not upload profile picture.");
    }
    const { error: saveErr } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", context.userId);
    if (saveErr) {
      console.error("[uploadAvatarImage] save:", saveErr);
      throw new Error("Could not save profile picture.");
    }
    return { path };
  });

const EquippedInput = z.object({ userIds: z.array(z.string().uuid()).max(100) });
export const getEquippedBadges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EquippedInput.parse(d))
  .handler(async ({ data }) => {
    if (data.userIds.length === 0)
      return [] as Array<{ user_id: string; badge_key: string; expires_at: string }>;
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_equipped_badges", {
      _user_ids: data.userIds,
    });
    if (error) {
      console.error("[getEquippedBadges]", error);
      return [] as Array<{ user_id: string; badge_key: string; expires_at: string }>;
    }
    return (rows ?? []) as Array<{ user_id: string; badge_key: string; expires_at: string }>;
  });
