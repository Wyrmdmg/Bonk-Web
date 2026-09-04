// Client-side middleware that puts the current session's bearer token on every
// server-function call. The auth middleware on the server side reads it back.
// Registered as a global functionMiddleware in src/start.ts; without that
// registration the token is never sent.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
