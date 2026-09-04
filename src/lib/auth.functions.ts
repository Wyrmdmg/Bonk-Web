import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";
import { z } from "zod";

const SignupInput = z.object({
  username: z.string().min(3).max(20),
  displayName: z.string().min(2).max(24),
  // Required, and Gmail only. Throwaway inboxes are what made one person able
  // to be twenty people, and every disposable-mail service is a domain we do
  // not have a list of, allowing exactly one provider is the check that does
  // not go stale.
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const signupUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignupInput.parse(d))
  .handler(async ({ data }) => {
    const {
      toSyntheticEmail,
      hashSecret,
      generateRecoveryCode,
      containsBlockedWord,
      USERNAME_RE,
      DISPLAY_NAME_RE,
    } = await import("./accounts.server");
    const { normalizeGmail } = await import("./gmail");
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");

    const username = data.username.toLowerCase().trim();
    const displayName = data.displayName.trim();
    const email = normalizeGmail(data.email);
    if (!email) throw new Error("Sign up with a Gmail address (name@gmail.com)");

    if (!USERNAME_RE.test(username)) throw new Error("Username must be 3-20 chars: a-z, 0-9, _");
    if (!DISPLAY_NAME_RE.test(displayName)) throw new Error("Display name has invalid characters");

    const { data: blockedWords } = await supabaseAdmin.from("blocked_words").select("word");
    const words = (blockedWords ?? []).map((r) => r.word);
    if (containsBlockedWord(username, words)) throw new Error("That username isn't allowed");
    if (containsBlockedWord(displayName, words)) throw new Error("That display name isn't allowed");

    // Cooldown checks (3 days)
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deletedU } = await supabaseAdmin
      .from("deleted_usernames")
      .select("username, deleted_at")
      .eq("username", username)
      .maybeSingle();
    if (deletedU && deletedU.deleted_at > cutoff) {
      throw new Error("This username was recently deleted. Try again in a few days.");
    }
    const { data: deletedE } = await supabaseAdmin
      .from("deleted_emails")
      .select("email, deleted_at")
      .eq("email", email)
      .maybeSingle();
    if (deletedE && deletedE.deleted_at > cutoff) {
      throw new Error("This email was recently used. Try again in a few days.");
    }

    // Ensure username is free
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) throw new Error("Username is taken");

    // One Gmail, one account. The address is stored canonically (see gmail.ts)
    // so dots and +tags cannot be used to sign up again with the same inbox.
    const { data: emailTaken } = await supabaseAdmin
      .from("profile_secrets")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (emailTaken) throw new Error("An account already uses that email");

    const recoveryCode = generateRecoveryCode();
    const recoveryHash = await hashSecret(recoveryCode);
    // The real address, not a synthetic one. Supabase can only send a password
    // reset to the address the account authenticates with, and "@…local" goes
    // nowhere. Accounts made before email was required keep the old form and
    // keep resetting with their recovery code.
    const authEmail = email;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: { username, display_name: displayName },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Signup failed");

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      username,
      display_name: displayName,
    });
    if (profileErr) {
      console.error("[signupUser] profile insert error:", profileErr);
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Could not create your account. Please try a different username.");
    }
    const { error: secretErr } = await supabaseAdmin.from("profile_secrets").insert({
      id: created.user.id,
      email,
      recovery_code_hash: recoveryHash,
    });
    if (secretErr) {
      console.error("[signupUser] profile_secrets insert error:", secretErr);
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error("Could not create your account. Please try again.");
    }

    return { userId: created.user.id, authEmail, recoveryCode };
  });

const SignInInput = z.object({
  // A username, or the Gmail the account was made with.
  who: z.string().min(3).max(64),
  password: z.string().min(1).max(128),
});

// Sign-in runs here, not in the browser, so that a username can be resolved
// from a Gmail address without exposing which accounts exist. The password
// grant happens with the anon key exactly as it would client-side, and the
// session it returns is handed back for supabase.auth.setSession().
//
export const signInUser = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignInInput.parse(d))
  .handler(async ({ data }) => {
    const { normalizeGmail } = await import("./gmail");
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");

    const who = data.who.trim().toLowerCase();
    let userId: string | undefined;
    if (who.includes("@")) {
      const email = normalizeGmail(who);
      // Wrong-provider addresses fail as credentials rather than as their own
      // message, so the form cannot be used to map which accounts exist.
      if (!email) throw new Error("INVALID_CREDENTIALS");
      const { data: secret } = await supabaseAdmin
        .from("profile_secrets")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      userId = secret?.id;
    } else {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", who)
        .maybeSingle();
      userId = profile?.id;
    }
    if (!userId) throw new Error("INVALID_CREDENTIALS");

    // Older accounts authenticate with a synthetic address, newer ones with
    // their Gmail. The auth record is the only thing that knows which.
    const { data: found } = await supabaseAdmin.auth.admin.getUserById(userId);
    const authEmail = found.user?.email;
    if (!authEmail) throw new Error("INVALID_CREDENTIALS");

    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !anon) throw new Error("Sign-in is not configured");
    const client = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signed, error } = await client.auth.signInWithPassword({
      email: authEmail,
      password: data.password,
    });
    if (error || !signed.session) {
      console.error("[signInUser] failed:", error?.status, error?.code, error?.message);
      const credentials =
        error?.code === "invalid_credentials" ||
        /invalid login credentials/i.test(error?.message ?? "");
      throw new Error(credentials ? "INVALID_CREDENTIALS" : (error?.message ?? "Sign-in failed"));
    }
    return {
      accessToken: signed.session.access_token,
      refreshToken: signed.session.refresh_token,
    };
  });

const ResetInput = z.object({
  username: z.string().min(3).max(20),
  recoveryCode: z.string().min(4),
  newPassword: z.string().min(8).max(128),
});
export const resetPasswordWithCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResetInput.parse(d))
  .handler(async ({ data }) => {
    const { verifySecret, hashSecret, generateRecoveryCode } = await import("./accounts.server");
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", data.username.toLowerCase())
      .maybeSingle();
    if (!profile) throw new Error("Invalid username or code");
    const { data: secret } = await supabaseAdmin
      .from("profile_secrets")
      .select("recovery_code_hash")
      .eq("id", profile.id)
      .maybeSingle();
    if (!secret) throw new Error("Invalid username or code");
    const ok = await verifySecret(
      data.recoveryCode.trim().toUpperCase(),
      secret.recovery_code_hash,
    );
    if (!ok) throw new Error("Invalid username or code");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: data.newPassword,
    });
    if (error) {
      console.error("[resetPasswordWithCode] updateUser error:", error);
      const msg = (error.message || "").toLowerCase();
      if (
        msg.includes("pwned") ||
        msg.includes("compromised") ||
        msg.includes("breach") ||
        msg.includes("leaked")
      ) {
        throw new Error(
          "This password has been found in a data breach. Please choose a different one.",
        );
      }
      if (
        msg.includes("weak") ||
        msg.includes("short") ||
        msg.includes("at least") ||
        msg.includes("characters") ||
        msg.includes("password should")
      ) {
        throw new Error(error.message);
      }
      if (msg.includes("same") || msg.includes("different from the old")) {
        throw new Error("New password must be different from your current password.");
      }
      throw new Error(error.message || "Could not reset password. Please try again.");
    }
    // Rotate the recovery code
    const newCode = generateRecoveryCode();
    await supabaseAdmin
      .from("profile_secrets")
      .update({ recovery_code_hash: await hashSecret(newCode) })
      .eq("id", profile.id);
    return { newRecoveryCode: newCode };
  });

const RenameInput = z.object({ displayName: z.string().min(2).max(24) });
export const updateDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RenameInput.parse(d))
  .handler(async ({ data, context }) => {
    const { containsBlockedWord, DISPLAY_NAME_RE } = await import("./accounts.server");
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const name = data.displayName.trim();
    if (!DISPLAY_NAME_RE.test(name)) throw new Error("Display name has invalid characters");
    const { data: words } = await supabaseAdmin.from("blocked_words").select("word");
    if (
      containsBlockedWord(
        name,
        (words ?? []).map((r) => r.word),
      )
    )
      throw new Error("That display name isn't allowed");
    const { error } = await context.supabase
      .from("profiles")
      .update({ display_name: name })
      .eq("id", context.userId);
    if (error) {
      console.error("[updateDisplayName] error:", error);
      throw new Error("Could not update display name. Please try again.");
    }
    return { ok: true };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/lib/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");
    const { data: secret } = await supabaseAdmin
      .from("profile_secrets")
      .select("email")
      .eq("id", context.userId)
      .maybeSingle();

    // End any bonks they host
    await supabaseAdmin
      .from("bonks")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("host_id", context.userId)
      .eq("status", "active");

    // The auth record goes first. It used to go last, after the cooldowns were
    // already written, so a failure here left a username marked deleted and an
    // account still standing, still signing in, still on the leaderboard.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) {
      console.error("[deleteMyAccount] deleteUser error:", error);
      throw new Error("Could not delete account. Please try again.");
    }

    // profiles.id cascades from auth.users on paper. These run anyway, because
    // an account that half-disappears is worse than two redundant deletes: the
    // leaderboard reads profiles, so a surviving row is a ghost with a score.
    await supabaseAdmin.from("profile_secrets").delete().eq("id", context.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", context.userId);

    const { data: left } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();
    if (left) {
      console.error("[deleteMyAccount] profile survived deletion:", context.userId);
      throw new Error("Your account was partly removed. Please contact support.");
    }

    // Only now, once there is definitely nothing left, do the names go on
    // cooldown. Writing them first meant a failed delete still burned the
    // username for three days.
    await supabaseAdmin
      .from("deleted_usernames")
      .upsert({ username: profile.username, deleted_at: new Date().toISOString() });
    if (secret?.email) {
      await supabaseAdmin
        .from("deleted_emails")
        .upsert({ email: secret.email, deleted_at: new Date().toISOString() });
    }
    return { ok: true };
  });
