import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Vite only exposes VITE_-prefixed variables to import.meta.env. Server code
// (the Supabase admin client, the auth middleware) reads process.env.SUPABASE_*
// directly, so the dev server and a local build need those hydrated from .env.
// Deployed runtimes get real environment variables from the host and never
// load this file.
Object.assign(process.env, loadEnv(process.env.NODE_ENV || "development", process.cwd(), ""));

// One id per build, compiled into both the client and the server bundle since
// they come from the same run. The deploy notice compares the id a loaded page
// holds against the id the server currently answers with; when they differ,
// that page is running against an older build and is prompted to reload.
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  String(Date.now());

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    sourcemap: false,
  },
  plugins: [
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      // Keep server-only modules out of the client bundle: a file named
      // *.server.ts, or one importing "server-only", is a build error if it
      // reaches a client entry.
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**", "**/*.server.ts", "**/*.server.tsx"],
          specifiers: ["server-only"],
        },
      },
    }),
    // nitro packages the SSR server for deployment. It auto-detects the target
    // (Vercel, Cloudflare, Netlify, Node) from the build environment; set
    // NITRO_PRESET to force one. Build only.
    nitro(),
    react(),
  ],
});
