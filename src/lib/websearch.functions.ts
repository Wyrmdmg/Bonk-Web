import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isCleanResult } from "@/lib/webfilter";

// Video search, run from the server for two reasons: YouTube sends no CORS
// headers, so the browser window cannot ask it directly; and Restricted Mode is
// a request header, which only a request we make ourselves can carry.
//
// Nothing is stored. Each call is a fetch and a parse, and the answer goes
// straight to the window that asked for it.

export type Video = {
  id: string;
  title: string;
  channel: string;
  length: string;
  thumb: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
/** YouTube's Restricted Mode: the same switch its own footer sets. */
const RESTRICTED = "PREF=f2=8000000";

const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: RESTRICTED,
};

/** Every object in a JSON tree. The results page nests renderers differently
 *  depending on what it decided to show, so the shape is walked, not indexed. */
function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
    return;
  }
  yield node as Record<string, unknown>;
  for (const v of Object.values(node)) yield* walk(v);
}

const runsText = (v: unknown) => {
  const runs = (v as { runs?: { text?: string }[] } | undefined)?.runs;
  return runs?.map((r) => r.text ?? "").join("") ?? "";
};

export const searchVideos = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ q: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ videos: Video[]; blocked: boolean }> => {
    if (!isCleanResult(data.q)) return { videos: [], blocked: true };
    let html: string;
    try {
      const res = await fetch(
        "https://www.youtube.com/results?search_query=" + encodeURIComponent(data.q),
        { headers: HEADERS },
      );
      html = await res.text();
    } catch {
      return { videos: [], blocked: false };
    }
    // Restricted Mode answers a refused query with a page carrying no results
    // payload at all, which is a legitimate empty answer rather than a failure.
    const m = /ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s.exec(html);
    if (!m) return { videos: [], blocked: false };
    let json: unknown;
    try {
      json = JSON.parse(m[1]);
    } catch {
      return { videos: [], blocked: false };
    }

    const seen = new Set<string>();
    const videos: Video[] = [];
    for (const node of walk(json)) {
      const v = node.videoRenderer as Record<string, unknown> | undefined;
      const id = typeof v?.videoId === "string" ? v.videoId : "";
      if (!id || seen.has(id)) continue;
      const title = runsText(v?.title);
      const channel = runsText(v?.ownerText) || runsText(v?.longBylineText);
      // Restricted Mode is YouTube's judgement; this is ours, on top of it.
      if (!isCleanResult(`${title} ${channel}`)) continue;
      seen.add(id);
      videos.push({
        id,
        title,
        channel,
        length: (v?.lengthText as { simpleText?: string } | undefined)?.simpleText ?? "",
        thumb:
          (v?.thumbnail as { thumbnails?: { url?: string }[] } | undefined)?.thumbnails?.[0]?.url ??
          "",
      });
      if (videos.length >= 18) break;
    }
    return { videos, blocked: false };
  });

/** A link typed into the address bar has not been through a filtered search, so
 *  its title is checked before it is allowed to play. A video that is private,
 *  deleted or age-restricted has no oEmbed record, and is refused on that. */
export const checkVideo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().regex(/^[\w-]{11}$/) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; title: string }> => {
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${data.id}`,
        )}`,
        { headers: HEADERS },
      );
      if (!res.ok) return { ok: false, title: "" };
      const j = (await res.json()) as { title?: string; author_name?: string };
      const title = String(j.title ?? "");
      return { ok: isCleanResult(`${title} ${j.author_name ?? ""}`), title };
    } catch {
      return { ok: false, title: "" };
    }
  });
