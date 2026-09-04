import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
};

type AuthState = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
};

// Module-level store so navigating between routes doesn't reset auth
// state to `null` while the session re-hydrates - that flash was
// causing a "signed out for a second" flicker on every tab switch.
let state: AuthState = { user: null, profile: null, loading: true };
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  emit();
}

let initialized = false;
let profileLoadSeq = 0;

function fallbackProfile(user: User): Profile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const username = String(meta.username ?? user.email?.split("@")[0] ?? "user").toLowerCase();
  const displayName = String(meta.display_name ?? meta.displayName ?? username);
  return {
    id: user.id,
    username,
    display_name: displayName,
    // Auth identities are always synthetic here; the real address lives in
    // profile_secrets and is loaded separately.
    email: null,
    avatar_url: null,
  };
}

async function loadProfile(user: User | null) {
  const seq = ++profileLoadSeq;
  if (!user) {
    setState({ profile: null });
    return;
  }
  const fallback = state.profile?.id === user.id ? state.profile : fallbackProfile(user);
  setState({ profile: fallback });
  const [{ data: p, error: pError }, { data: s, error: sError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("profile_secrets").select("email").eq("id", user.id).maybeSingle(),
  ]);
  if (seq !== profileLoadSeq) return;
  // Transient network/RLS/auth hydration failures should not make the header
  // look signed out for a second. Keep the last known/fallback profile and try
  // again shortly instead of clearing it.
  if (pError || sError) {
    window.setTimeout(() => {
      if (state.user?.id === user.id) void loadProfile(user);
    }, 1500);
    return;
  }
  if (!p) {
    setState({ profile: fallback });
    return;
  }
  setState({
    profile: {
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      email: s?.email ?? null,
      avatar_url: (p as { avatar_url?: string | null }).avatar_url ?? null,
    },
  });
}

function init() {
  if (initialized) return;
  initialized = true;
  supabase.auth.getSession().then(({ data }) => {
    const u = data.session?.user ?? null;
    setState({
      user: u,
      profile: u ? (state.profile?.id === u.id ? state.profile : fallbackProfile(u)) : null,
      loading: false,
    });
    loadProfile(u);
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (
      event === "SIGNED_IN" ||
      event === "SIGNED_OUT" ||
      event === "USER_UPDATED" ||
      event === "INITIAL_SESSION"
    ) {
      const u = session?.user ?? null;
      // Skip redundant identity emits so subscribers don't re-render on
      // TOKEN_REFRESHED-adjacent INITIAL_SESSION events with the same user.
      if (u?.id === state.user?.id && event === "INITIAL_SESSION") return;
      setState({
        user: u,
        profile: u ? (state.profile?.id === u.id ? state.profile : fallbackProfile(u)) : null,
        loading: false,
      });
      loadProfile(u);
    }
  });
  if (typeof window !== "undefined") {
    window.addEventListener("bonk:profile-updated", () => {
      if (state.user) void loadProfile(state.user);
    });
  }
}

const subscribe = (cb: () => void) => {
  init();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const getSnapshot = () => state;
const getServerSnapshot = () => state;

export function useAuth() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Ensure init runs eagerly on the client even before any component subscribes.
  useEffect(() => {
    init();
  }, []);
  return s;
}
