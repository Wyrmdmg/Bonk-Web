import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

import { BUILD_ID } from "@/lib/build";

/**
 * Which build is currently deployed.
 *
 * The client bundle carries the same constant, frozen at whatever it was when
 * that page was served. When the two disagree, the page in front of somebody
 * is older than the site behind it, and `useFreshBuild` says so.
 *
 * Deliberately uncacheable. A cached answer would be a stale answer, which is
 * the one thing this route cannot be and still mean anything.
 */
export const Route = createFileRoute("/api/build")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ id: BUILD_ID }), {
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store, max-age=0",
          },
        }),
    },
  },
});
