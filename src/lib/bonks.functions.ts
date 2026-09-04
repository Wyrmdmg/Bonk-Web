import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { z } from "zod";

const LEAVE_COOLDOWN_MS = 30_000;
const HOST_TIMEOUT_MS = 5 * 60_000; // slow/mobile tabs can miss short heartbeats; don't steal host during normal backgrounding
const MEMBER_TIMEOUT_MS = 120_000; // prune ghost members whose browser was force-quit
const OVERDUE_GRACE_MS = 20_000; // tolerate client clock skew / background-tab wakeups before auto-advancing
const AUTO_RESTART_DELAY_MS = 60_000;

// Moderators can act on any bonk without being its host. The names come from
// ADMIN_USERNAMES (comma separated) rather than the source, because the old
// hardcoded name was compiled into the public bundle and said who runs this.
// Unset means nobody has the power, which is the safe way to be wrong.
const adminNames = () =>
  (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);

async function isAdminUser(userId: string): Promise<boolean> {
  const names = adminNames();
  if (names.length === 0) return false;
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.username && names.includes(data.username.toLowerCase());
}

/** Whether the caller may moderate. The client uses it to decide what to show;
 *  every action re-checks server-side, so a lie here buys nothing. */
export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({ admin: await isAdminUser(context.userId) }));

async function assertHostOrAdmin(userId: string, hostId: string, action: string) {
  if (userId === hostId) return;
  if (await isAdminUser(userId)) return;
  throw new Error(`Only host can ${action}`);
}

async function assertNoCooldown(userId: string) {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("leave_cooldowns")
    .select("until")
    .eq("user_id", userId)
    .maybeSingle();
  if (data && new Date(data.until).getTime() > Date.now()) {
    const secs = Math.ceil((new Date(data.until).getTime() - Date.now()) / 1000);
    throw new Error(`Wait ${secs}s before joining another bonk`);
  }
}

// Ensures a user isn't already hosting or a member of another active bonk.
// Pass `exceptBonkId` to allow the caller's current bonk (e.g. rejoining).
async function assertNotInAnotherBonk(userId: string, exceptBonkId?: string) {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  const { data: hosting } = await supabaseAdmin
    .from("bonks")
    .select("id, name")
    .eq("host_id", userId)
    .eq("status", "active");
  const otherHost = (hosting ?? []).find((b) => b.id !== exceptBonkId);
  if (otherHost)
    throw new Error(`You're already hosting "${otherHost.name}". End it or transfer host first.`);
  const { data: memberships } = await supabaseAdmin
    .from("bonk_members")
    .select("bonk_id, bonk:bonks!inner(id, name, status)")
    .eq("user_id", userId);
  const otherMember = (memberships ?? []).find(
    (m) => m.bonk?.status === "active" && m.bonk_id !== exceptBonkId,
  );
  if (otherMember) throw new Error(`You're already in "${otherMember.bonk.name}". Leave it first.`);
}

const CreateInput = z.object({
  name: z.string().min(1).max(40),
  password: z
    .string()
    .max(64)
    .optional()
    .transform((v) => (v ? v : undefined)),
  joinMode: z.enum(["open", "password", "request"]),
  timerType: z.enum(["pomodoro", "stopwatch", "custom", "interval"]),
  focusMin: z.number().int().min(1).max(120),
  breakMin: z.number().int().min(0).max(60),
  targetCycles: z.number().int().min(1).max(20),
});
export const createBonk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { hashSecret } = await import("@/lib/accounts.server");
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    if (data.joinMode === "password" && !data.password) throw new Error("Password required");
    await assertNotInAnotherBonk(context.userId);
    const passwordHash = data.password ? await hashSecret(data.password) : null;
    const { data: created, error } = await supabaseAdmin
      .from("bonks")
      .insert({
        host_id: context.userId,
        name: data.name,
        join_mode: data.joinMode,
        timer_type: data.timerType,
        focus_min: data.focusMin,
        break_min: data.breakMin,
        target_cycles: data.targetCycles,
      })
      .select()
      .single();
    if (error) {
      console.error("[createBonk] insert error:", error);
      throw new Error("Could not create session. Please try again.");
    }
    if (passwordHash) {
      await supabaseAdmin
        .from("bonk_secrets")
        .insert({ bonk_id: created.id, password_hash: passwordHash });
    }
    await supabaseAdmin
      .from("bonk_members")
      .insert({ bonk_id: created.id, user_id: context.userId });
    await supabaseAdmin.from("bonk_presence").upsert({
      bonk_id: created.id,
      user_id: context.userId,
      last_seen: new Date().toISOString(),
    });
    return { id: created.id };
  });

const JoinInput = z.object({ bonkId: z.string().uuid(), password: z.string().optional() });
export const joinBonk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JoinInput.parse(d))
  .handler(async ({ data, context }) => {
    const { verifySecret } = await import("@/lib/accounts.server");
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    // Run independent lookups in parallel - was 3 sequential round-trips.
    const [cooldownRes, bannedRes, bonkRes, existingRes] = await Promise.all([
      supabaseAdmin
        .from("leave_cooldowns")
        .select("until")
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("bonk_bans")
        .select("user_id")
        .eq("bonk_id", data.bonkId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      supabaseAdmin.from("bonks").select("*").eq("id", data.bonkId).maybeSingle(),
      supabaseAdmin
        .from("bonk_members")
        .select("user_id")
        .eq("bonk_id", data.bonkId)
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (cooldownRes.data && new Date(cooldownRes.data.until).getTime() > Date.now()) {
      const secs = Math.ceil((new Date(cooldownRes.data.until).getTime() - Date.now()) / 1000);
      throw new Error(`Wait ${secs}s before joining another bonk`);
    }
    if (bannedRes.data) throw new Error("You are banned from this bonk.");
    const bonk = bonkRes.data;
    if (!bonk || bonk.status !== "active") throw new Error("Bonk not available");
    if (existingRes.data) {
      // Refresh presence so the room shows us right away.
      await supabaseAdmin.from("bonk_presence").upsert({
        bonk_id: data.bonkId,
        user_id: context.userId,
        last_seen: new Date().toISOString(),
      });
      return { status: "joined" as const };
    }
    await assertNotInAnotherBonk(context.userId, data.bonkId);

    if (bonk.join_mode === "password") {
      const { data: secret } = await supabaseAdmin
        .from("bonk_secrets")
        .select("password_hash")
        .eq("bonk_id", data.bonkId)
        .maybeSingle();
      if (!data.password || !secret?.password_hash) throw new Error("Password required");
      const ok = await verifySecret(data.password, secret.password_hash);
      if (!ok) throw new Error("Wrong password");
    }
    if (bonk.join_mode === "request") {
      await supabaseAdmin
        .from("bonk_requests")
        .upsert({ bonk_id: data.bonkId, user_id: context.userId, status: "pending" });
      return { status: "requested" as const };
    }
    const [{ error }] = await Promise.all([
      supabaseAdmin.from("bonk_members").insert({ bonk_id: data.bonkId, user_id: context.userId }),
      supabaseAdmin.from("bonk_presence").upsert({
        bonk_id: data.bonkId,
        user_id: context.userId,
        last_seen: new Date().toISOString(),
      }),
    ]);
    if (error) {
      console.error("[joinBonk] insert error:", error);
      throw new Error("Could not join session. Please try again.");
    }
    return { status: "joined" as const };
  });

const RespondInput = z.object({ requestId: z.string().uuid(), accept: z.boolean() });
export const respondJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RespondInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: req } = await supabaseAdmin
      .from("bonk_requests")
      .select("*, bonk:bonks(host_id, status)")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Request not found");
    if (req.bonk.host_id !== context.userId && !(await isAdminUser(context.userId)))
      throw new Error("Only host can respond");
    await supabaseAdmin
      .from("bonk_requests")
      .update({ status: data.accept ? "accepted" : "rejected" })
      .eq("id", data.requestId);
    if (data.accept) {
      await supabaseAdmin
        .from("bonk_members")
        .upsert({ bonk_id: req.bonk_id, user_id: req.user_id });
    }
    return { ok: true };
  });

const BonkIdInput = z.object({ bonkId: z.string().uuid() });

export const leaveBonk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BonkIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("*")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk) throw new Error("Bonk not found");
    await supabaseAdmin
      .from("bonk_members")
      .delete()
      .eq("bonk_id", data.bonkId)
      .eq("user_id", context.userId);
    await supabaseAdmin
      .from("bonk_presence")
      .delete()
      .eq("bonk_id", data.bonkId)
      .eq("user_id", context.userId);
    // 30s cooldown
    await supabaseAdmin.from("leave_cooldowns").upsert({
      user_id: context.userId,
      until: new Date(Date.now() + LEAVE_COOLDOWN_MS).toISOString(),
    });
    if (bonk.host_id === context.userId) {
      // Transfer to earliest remaining member, else end.
      const { data: next } = await supabaseAdmin
        .from("bonk_members")
        .select("user_id, joined_at")
        .eq("bonk_id", data.bonkId)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) {
        await supabaseAdmin.from("bonks").update({ host_id: next.user_id }).eq("id", data.bonkId);
      } else {
        await supabaseAdmin
          .from("bonks")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", data.bonkId);
      }
    } else {
      // If no members remain (shouldn't happen if host still there), end
      const { count } = await supabaseAdmin
        .from("bonk_members")
        .select("user_id", { count: "exact", head: true })
        .eq("bonk_id", data.bonkId);
      if (!count) {
        await supabaseAdmin
          .from("bonks")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", data.bonkId);
      }
    }
    return { ok: true };
  });

const TransferInput = z.object({ bonkId: z.string().uuid(), newHostId: z.string().uuid() });
export const transferHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TransferInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("host_id")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk || (bonk.host_id !== context.userId && !(await isAdminUser(context.userId))))
      throw new Error("Only host can transfer");
    const { data: member } = await supabaseAdmin
      .from("bonk_members")
      .select("user_id")
      .eq("bonk_id", data.bonkId)
      .eq("user_id", data.newHostId)
      .maybeSingle();
    if (!member) throw new Error("Target is not a member");
    await supabaseAdmin.from("bonks").update({ host_id: data.newHostId }).eq("id", data.bonkId);
    return { ok: true };
  });

export const endBonk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BonkIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("host_id")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk || (bonk.host_id !== context.userId && !(await isAdminUser(context.userId))))
      throw new Error("Only host can end bonk");
    await supabaseAdmin
      .from("bonks")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.bonkId);
    return { ok: true };
  });

const CycleInput = z.object({
  bonkId: z.string().uuid(),
  action: z.enum(["start", "pause", "reset", "skip"]),
});
export const controlCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CycleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("*")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk || (bonk.host_id !== context.userId && !(await isAdminUser(context.userId))))
      throw new Error("Only host controls the timer");
    const patch: {
      cycle_state?: "idle" | "focus" | "break";
      cycle_started_at?: string | null;
      cycle_paused_at?: string | null;
      current_cycle?: number;
      restart_at?: string | null;
    } = {};
    const nowIso = new Date().toISOString();
    if (data.action === "start") {
      // Starting always clears any pending auto-restart countdown.
      patch.restart_at = null;
      // Resume from paused: shift cycle_started_at forward by the pause duration.
      if (bonk.cycle_paused_at && bonk.cycle_started_at && bonk.cycle_state !== "idle") {
        const pausedMs = Date.now() - new Date(bonk.cycle_paused_at).getTime();
        const shifted = new Date(
          new Date(bonk.cycle_started_at).getTime() + pausedMs,
        ).toISOString();
        patch.cycle_started_at = shifted;
        patch.cycle_paused_at = null;
      } else {
        patch.cycle_state = bonk.cycle_state === "break" ? "break" : "focus";
        patch.cycle_started_at = nowIso;
        patch.cycle_paused_at = null;
        if (bonk.cycle_state === "idle" && bonk.current_cycle >= bonk.target_cycles) {
          patch.current_cycle = 1;
        }
      }
    } else if (data.action === "pause") {
      if (bonk.cycle_state !== "idle" && bonk.cycle_started_at && !bonk.cycle_paused_at) {
        patch.cycle_paused_at = nowIso;
      }
    } else if (data.action === "reset") {
      patch.cycle_state = "idle";
      patch.cycle_started_at = null;
      patch.cycle_paused_at = null;
      patch.restart_at = null;
    } else if (data.action === "skip") {
      if (bonk.cycle_state === "focus" && bonk.break_min > 0) {
        patch.cycle_state = "break";
        patch.cycle_started_at = nowIso;
        patch.cycle_paused_at = null;
      } else {
        // Advance cycle
        const next = bonk.current_cycle + 1;
        if (next > bonk.target_cycles) {
          patch.cycle_state = "idle";
          patch.cycle_started_at = null;
          patch.cycle_paused_at = null;
          patch.current_cycle = bonk.target_cycles;
          if (bonk.auto_restart) {
            patch.restart_at = new Date(Date.now() + AUTO_RESTART_DELAY_MS).toISOString();
          }
        } else {
          patch.current_cycle = next;
          patch.cycle_state = "focus";
          patch.cycle_started_at = nowIso;
          patch.cycle_paused_at = null;
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      // Guard skip transitions on the current cycle_started_at so a manual
      // Skip click racing with the overdue watchdog can't double-advance
      // (which would skip a whole break session).
      let q = supabaseAdmin.from("bonks").update(patch).eq("id", data.bonkId);
      if (data.action === "skip" && bonk.cycle_started_at) {
        q = q.eq("cycle_started_at", bonk.cycle_started_at);
      }
      await q;
    }
    return { ok: true };
  });

/**
 * Presence rows for a bonk, each carrying when that member joined.
 *
 * This was one query with a `member:bonk_members!inner(joined_at)` embed, which
 * PostgREST refuses: there is no foreign key between bonk_presence and
 * bonk_members, so it answered PGRST200 every time. The result was discarded
 * without checking `error`, and the callbacks were typed `any`, so nothing said
 * a word, the ghost reap saw an empty list and never reaped, and host handoff
 * saw an empty list and never promoted, which meant a room whose host closed
 * their tab simply stopped having anyone who could drive the timer.
 */
async function presenceWithJoinedAt(bonkId: string, since?: string) {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");
  let q = supabaseAdmin.from("bonk_presence").select("user_id, last_seen").eq("bonk_id", bonkId);
  if (since) q = q.gte("last_seen", since);
  const [{ data: presence, error: pErr }, { data: members, error: mErr }] = await Promise.all([
    q,
    supabaseAdmin.from("bonk_members").select("user_id, joined_at").eq("bonk_id", bonkId),
  ]);
  if (pErr || mErr) {
    console.error("[presenceWithJoinedAt]", pErr ?? mErr);
    return [];
  }
  const joined = new Map((members ?? []).map((m) => [m.user_id, m.joined_at]));
  return (presence ?? []).map((p) => ({ ...p, joined_at: joined.get(p.user_id) ?? null }));
}

// Heartbeat presence and, if the host has been silent past HOST_TIMEOUT,
// claim host if we're the earliest-joined present member. Safe under contention
// because we only take over when the caller is that earliest-joined member and
// the current host's last_seen is stale.
export const heartbeatBonk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BonkIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    await supabaseAdmin.from("bonk_presence").upsert({
      bonk_id: data.bonkId,
      user_id: context.userId,
      last_seen: new Date().toISOString(),
    });
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("host_id, status")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk || bonk.status !== "active") return { ok: true, promoted: false };

    // Reap ghost members whose browsers were force-quit (no presence heartbeat
    // in MEMBER_TIMEOUT_MS). Only runs when the host has enabled afk_kick - by
    // default users are NOT removed for switching tabs / going idle.
    const { data: bonkFull } = await supabaseAdmin
      .from("bonks")
      .select("afk_kick")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (bonkFull?.afk_kick) {
      const memberCutoff = new Date(Date.now() - MEMBER_TIMEOUT_MS).toISOString();
      // Grace: never reap someone who joined less than 3 minutes ago -
      // browser heartbeats can lag on slow connections / tab wake and we
      // don't want to boot fresh joiners.
      const joinGrace = new Date(Date.now() - 3 * 60_000).toISOString();
      const allPresence = await presenceWithJoinedAt(data.bonkId);
      const stale = allPresence.filter(
        (p) =>
          p.user_id !== bonk.host_id &&
          new Date(p.last_seen).getTime() < new Date(memberCutoff).getTime() &&
          p.joined_at !== null &&
          new Date(p.joined_at).getTime() < new Date(joinGrace).getTime(),
      );
      for (const s of stale) {
        await supabaseAdmin
          .from("bonk_members")
          .delete()
          .eq("bonk_id", data.bonkId)
          .eq("user_id", s.user_id);
        await supabaseAdmin
          .from("bonk_presence")
          .delete()
          .eq("bonk_id", data.bonkId)
          .eq("user_id", s.user_id);
      }
    }

    if (bonk.host_id === context.userId) return { ok: true, promoted: false };
    const { data: hostPresence } = await supabaseAdmin
      .from("bonk_presence")
      .select("last_seen")
      .eq("bonk_id", data.bonkId)
      .eq("user_id", bonk.host_id)
      .maybeSingle();
    const hostStale =
      !hostPresence || Date.now() - new Date(hostPresence.last_seen).getTime() > HOST_TIMEOUT_MS;
    if (!hostStale) return { ok: true, promoted: false };
    // Earliest joined present member (present == heartbeat within HOST_TIMEOUT_MS)
    const cutoff = new Date(Date.now() - HOST_TIMEOUT_MS).toISOString();
    const present = await presenceWithJoinedAt(data.bonkId, cutoff);
    if (present.length === 0) return { ok: true, promoted: false };
    const sorted = present
      .filter((p): p is typeof p & { joined_at: string } => p.joined_at !== null)
      .sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
    if (sorted[0]?.user_id !== context.userId) return { ok: true, promoted: false };
    // Transfer host role only - do NOT delete the previous host from members.
    // If they reconnect they can leave cleanly; if they stay disconnected
    // the ghost-reap above will remove them after MEMBER_TIMEOUT_MS.
    await supabaseAdmin
      .from("bonks")
      .update({ host_id: context.userId })
      .eq("id", data.bonkId)
      .eq("host_id", bonk.host_id);
    return { ok: true, promoted: true };
  });

// Any member can nudge the timer forward when the current block has been
// overdue (past duration + grace) for a while. Safe because the server
// checks conditions atomically and produces the same skip result the host
// would have produced. Prevents the room from getting stuck at 00:00 when
// the host disconnects.
export const advanceIfOverdue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BonkIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    // Must be a member of this bonk.
    const { data: member } = await supabaseAdmin
      .from("bonk_members")
      .select("user_id")
      .eq("bonk_id", data.bonkId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) return { ok: false, advanced: false };
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("*")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk || bonk.status !== "active") return { ok: false, advanced: false };
    if (bonk.cycle_state === "idle" || !bonk.cycle_started_at || bonk.cycle_paused_at) {
      return { ok: true, advanced: false };
    }
    if (bonk.timer_type === "stopwatch") return { ok: true, advanced: false };
    const durSec = ((bonk.cycle_state === "break" ? bonk.break_min : bonk.focus_min) ?? 0) * 60;
    const elapsedMs = Date.now() - new Date(bonk.cycle_started_at).getTime();
    // Only advance if the SERVER agrees the block is overdue. Some users have
    // device clocks minutes ahead, which made their client show 00:00 and poke
    // this endpoint early, causing rooms to skip for everyone.
    if (elapsedMs < durSec * 1000 + OVERDUE_GRACE_MS) {
      return { ok: true, advanced: false };
    }
    // Apply the same transition as `skip`. Guard the update with the current
    // cycle_started_at so concurrent callers become no-ops.
    const nowIso = new Date().toISOString();
    const patch: {
      cycle_state?: "idle" | "focus" | "break";
      cycle_started_at?: string | null;
      cycle_paused_at?: string | null;
      current_cycle?: number;
      restart_at?: string | null;
    } = {};
    if (bonk.cycle_state === "focus" && bonk.break_min > 0) {
      patch.cycle_state = "break";
      patch.cycle_started_at = nowIso;
      patch.cycle_paused_at = null;
    } else {
      const next = bonk.current_cycle + 1;
      if (next > bonk.target_cycles) {
        patch.cycle_state = "idle";
        patch.cycle_started_at = null;
        patch.cycle_paused_at = null;
        patch.current_cycle = bonk.target_cycles;
        if (bonk.auto_restart) {
          patch.restart_at = new Date(Date.now() + AUTO_RESTART_DELAY_MS).toISOString();
        }
      } else {
        patch.current_cycle = next;
        patch.cycle_state = "focus";
        patch.cycle_started_at = nowIso;
        patch.cycle_paused_at = null;
      }
    }
    const { data: updated } = await supabaseAdmin
      .from("bonks")
      .update(patch)
      .eq("id", data.bonkId)
      .eq("cycle_started_at", bonk.cycle_started_at)
      .select("id");
    return { ok: true, advanced: !!updated && updated.length > 0 };
  });

// Host-only. Edits timer settings mid-session. When the timer is currently
// running, we do NOT touch cycle_started_at so the current block continues
// from wherever it is - new durations apply on the next transition.
const UpdateSettingsInput = z.object({
  bonkId: z.string().uuid(),
  focusMin: z.number().int().min(1).max(120).optional(),
  breakMin: z.number().int().min(0).max(60).optional(),
  targetCycles: z.number().int().min(1).max(20).optional(),
  autoRestart: z.boolean().optional(),
  chatEnabled: z.boolean().optional(),
  chatSlowModeSec: z.number().int().min(1).max(3600).optional(),
  afkKick: z.boolean().optional(),
});
export const updateBonkSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("host_id, current_cycle")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk || (bonk.host_id !== context.userId && !(await isAdminUser(context.userId))))
      throw new Error("Only host can edit settings");
    // Spelled out rather than Record<string, unknown>, so a typo in a column
    // name is a build error instead of a silently ignored update.
    const patch: {
      focus_min?: number;
      break_min?: number;
      target_cycles?: number;
      current_cycle?: number;
      auto_restart?: boolean;
      chat_enabled?: boolean;
      chat_slow_mode_sec?: number;
      afk_kick?: boolean;
    } = {};
    if (typeof data.focusMin === "number") patch.focus_min = data.focusMin;
    if (typeof data.breakMin === "number") patch.break_min = data.breakMin;
    if (typeof data.targetCycles === "number") {
      patch.target_cycles = data.targetCycles;
      if (bonk.current_cycle > data.targetCycles) patch.current_cycle = data.targetCycles;
    }
    if (typeof data.autoRestart === "boolean") patch.auto_restart = data.autoRestart;
    if (typeof data.chatEnabled === "boolean") patch.chat_enabled = data.chatEnabled;
    if (typeof data.chatSlowModeSec === "number") patch.chat_slow_mode_sec = data.chatSlowModeSec;
    if (typeof data.afkKick === "boolean") patch.afk_kick = data.afkKick;
    if (Object.keys(patch).length === 0) return { ok: true };
    await supabaseAdmin.from("bonks").update(patch).eq("id", data.bonkId);
    return { ok: true };
  });

// Any member can trigger this. When the room finished its cycles AND
// auto_restart is enabled AND the scheduled restart_at is in the past,
// restart from cycle 1. The row-guard on restart_at makes concurrent calls
// no-ops.
export const restartCyclesIfDue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BonkIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: member } = await supabaseAdmin
      .from("bonk_members")
      .select("user_id")
      .eq("bonk_id", data.bonkId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member) return { ok: false, restarted: false };
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("*")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk || bonk.status !== "active") return { ok: false, restarted: false };
    const restartAt = bonk.restart_at as string | null;
    if (!bonk.auto_restart || !restartAt) return { ok: true, restarted: false };
    if (new Date(restartAt).getTime() > Date.now()) return { ok: true, restarted: false };
    const nowIso = new Date().toISOString();
    const { data: updated } = await supabaseAdmin
      .from("bonks")
      .update({
        cycle_state: "focus",
        cycle_started_at: nowIso,
        cycle_paused_at: null,
        current_cycle: 1,
        restart_at: null,
      })
      .eq("id", data.bonkId)
      .eq("restart_at", restartAt)
      .select("id");
    return { ok: true, restarted: !!updated && updated.length > 0 };
  });

const KickInput = z.object({
  bonkId: z.string().uuid(),
  userId: z.string().uuid(),
  ban: z.boolean().optional(),
});
// Host-only. Removes a member from the room. When `ban` is true, also records
// a permanent ban so the target cannot rejoin this specific bonk.
export const kickFromBonk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => KickInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("host_id, status")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk) throw new Error("Bonk not found");
    if (bonk.host_id !== context.userId && !(await isAdminUser(context.userId)))
      throw new Error("Only host can kick");
    if (data.userId === context.userId) throw new Error("You can't kick yourself");
    await supabaseAdmin
      .from("bonk_members")
      .delete()
      .eq("bonk_id", data.bonkId)
      .eq("user_id", data.userId);
    await supabaseAdmin
      .from("bonk_presence")
      .delete()
      .eq("bonk_id", data.bonkId)
      .eq("user_id", data.userId);
    await supabaseAdmin
      .from("bonk_requests")
      .delete()
      .eq("bonk_id", data.bonkId)
      .eq("user_id", data.userId);
    if (data.ban) {
      await supabaseAdmin.from("bonk_bans").upsert({
        bonk_id: data.bonkId,
        user_id: data.userId,
        banned_by: context.userId,
      });
    }
    return { ok: true };
  });

const UnbanInput = z.object({ bonkId: z.string().uuid(), userId: z.string().uuid() });
export const unbanFromBonk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UnbanInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("host_id")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk || (bonk.host_id !== context.userId && !(await isAdminUser(context.userId))))
      throw new Error("Only host can unban");
    await supabaseAdmin
      .from("bonk_bans")
      .delete()
      .eq("bonk_id", data.bonkId)
      .eq("user_id", data.userId);
    return { ok: true };
  });

// Send a mention notification for one or more users in a bonk chat. The
// sender must be a member of the bonk; targets must also be members.
// Chat itself is ephemeral (Realtime broadcast) but mention notifications
// persist so users see them in the notification panel.
const MentionInput = z.object({
  bonkId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).min(1).max(20),
  preview: z.string().max(160),
});
export const notifyMention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MentionInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const [{ data: sender }, { data: bonk }, { data: members }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("username, display_name")
        .eq("id", context.userId)
        .maybeSingle(),
      supabaseAdmin.from("bonks").select("id, name, status").eq("id", data.bonkId).maybeSingle(),
      supabaseAdmin.from("bonk_members").select("user_id").eq("bonk_id", data.bonkId),
    ]);
    if (!sender) throw new Error("Profile missing");
    if (!bonk || bonk.status !== "active") throw new Error("Bonk not active");
    const memberSet = new Set((members ?? []).map((m) => m.user_id));
    if (!memberSet.has(context.userId)) throw new Error("Not a member");
    const targets = data.userIds.filter((u) => u !== context.userId && memberSet.has(u));
    if (targets.length === 0) return { ok: true, count: 0 };
    const rows = targets.map((uid) => ({
      user_id: uid,
      title: `@${sender.username} mentioned you`,
      body: data.preview.slice(0, 160),
      type: "mention",
      link: `/bonks/${bonk.id}`,
    }));
    await supabaseAdmin.from("notifications").insert(rows);
    return { ok: true, count: targets.length };
  });

// Server-authenticated chat moderation. Only the host or a moderator may broadcast
// mute/delete events; broadcasts go out on a server-only topic (bonk-mod-*)
// whose INSERT policy on realtime.messages is empty for authenticated, so
// members cannot spoof moderation events - only the service role can send.
const ModInput = z.object({
  bonkId: z.string().uuid(),
  action: z.enum(["delete", "mute", "unmute"]),
  targetMsgId: z.string().max(80).optional(),
  targetUserId: z.string().uuid().optional(),
});
export const moderateChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ModInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: bonk } = await supabaseAdmin
      .from("bonks")
      .select("host_id, status")
      .eq("id", data.bonkId)
      .maybeSingle();
    if (!bonk) throw new Error("Bonk not found");
    if (bonk.host_id !== context.userId && !(await isAdminUser(context.userId))) {
      throw new Error("Only host can moderate chat");
    }
    const topic = `bonk-mod-${data.bonkId}`;
    const event = data.action === "delete" ? "delete" : data.action === "mute" ? "mute" : "unmute";
    const payload =
      data.action === "delete"
        ? { id: data.targetMsgId }
        : { user_id: data.targetUserId, unmute: data.action === "unmute" };
    // Server-side broadcast via service role. RLS lets members receive; no
    // authenticated INSERT policy exists so no member can forge these.
    const ch = supabaseAdmin.channel(topic, { config: { private: true } });
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
      setTimeout(resolve, 1500);
    });
    await ch.send({ type: "broadcast", event, payload });
    await supabaseAdmin.removeChannel(ch);
    return { ok: true };
  });
