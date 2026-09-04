// The browser Supabase client. Built with the publishable key, so every query
// runs under row level security as the signed-in user, or anonymously.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);

    // A hung PostgREST/Auth request otherwise leaves every loading screen
    // spinning until the browser's own multi-minute timeout. Fail at 15s so
    // the app shows an error and can retry instead.
    const timeout = AbortSignal.timeout(15_000);
    const signal =
      init?.signal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([init.signal, timeout])
        : timeout;

    return fetch(input, { ...init, headers, signal });
  };
}

/**
 * Reading `localStorage` is a property access, and that access itself throws in
 * a sandboxed iframe and under some privacy settings. Unguarded it took the
 * whole app down at client construction, which is what the browser window's own
 * "something broke" page was. Probe it, and fall back to memory: the session
 * then lasts for the page rather than beyond it, which beats no app at all.
 */
function authStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const probe = "__wd_storage_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: (i: number) => [...mem.keys()][i] ?? null,
      get length() {
        return mem.size;
      },
    } as Storage;
  }
}

function createSupabaseClient() {
  // import.meta.env is substituted at build time for the browser bundle;
  // process.env is read at request time during server rendering.
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(", ")}. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the hosting platform's build settings and redeploy. Vite substitutes these at build time, so changing them on a running server has no effect.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: authStorage(),
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Constructed lazily on first use: reading the env and touching localStorage
// during module load would run on the server and crash the render.
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
