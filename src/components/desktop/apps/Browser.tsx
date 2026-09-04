import { useCallback, useEffect, useRef, useState } from "react";
import { XPIcon } from "@/components/XPIcon";
import { FILTER_COUNTS, isCleanResult, resolveInput, searchUrl, ytId } from "@/lib/webfilter";
import type { BlockKind } from "@/lib/webfilter";
import { checkVideo, searchVideos, type Video } from "@/lib/websearch.functions";
import { playSound } from "@/lib/sound";
import { useT } from "@/lib/i18n";
import { PLACES, refusesFrames, toEmbed } from "@/lib/embed";

// Bonk Explorer. Single window, no tabs, because that is what a browser on this
// machine actually looked like.
//
// Searching gives you videos, which play here, and encyclopaedia articles,
// which read here. Anything else you type is opened in the window if the site
// allows it and handed to a real tab if it does not, that is the site's call,
// not ours, and the UI says so rather than showing you a blank rectangle.
//
// The content filter is not a setting. Queries, addresses and every result
// title go through it, and there is no switch to turn it off.
//
// Nothing is written to disk. History lives in component state and dies with
// the window; video plays from youtube-nocookie.com, which is the embed that
// keeps no viewing record.

type Page =
  | { kind: "home" }
  | { kind: "results"; query: string }
  | { kind: "video"; id: string; title: string }
  | { kind: "frame"; url: string; label: string }
  | { kind: "player"; url: string; label: string; site: string }
  | { kind: "refused"; url: string; label: string }
  | { kind: "blocked"; reason: BlockKind; host: string }
  | { kind: "self" };

type Article = { title: string; extract: string; thumb?: string };

/** This machine's own address. Framing it would nest the whole desktop inside
 *  itself, in a sandbox with no storage, which is not a browser feature. */
const isSelf = (url: string) => {
  try {
    return typeof window !== "undefined" && new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
};

const label = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function Browser() {
  const [history, setHistory] = useState<Page[]>([{ kind: "home" }]);
  const [at, setAt] = useState(0);
  const [input, setInput] = useState("");
  const [ads, setAds] = useState(true);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [frameNote, setFrameNote] = useState(false);
  const page = history[at];
  const { t } = useT();

  const go = useCallback(
    (next: Page) => {
      setHistory((h) => [...h.slice(0, at + 1), next]);
      setAt((i) => i + 1);
      playSound("nav");
    },
    [at],
  );

  useEffect(() => {
    setInput(
      page.kind === "frame" || page.kind === "player" || page.kind === "refused"
        ? page.url
        : page.kind === "results"
          ? page.query
          : "",
    );
    // A frame that is refused renders blank with no event we can catch, so the
    // note appears on a timer and tells you what to do about it.
    setFrameNote(false);
    if (page.kind !== "frame") return;
    const t = setTimeout(() => setFrameNote(true), 2500);
    return () => clearTimeout(t);
  }, [page]);

  // Videos come from our own server, which is the only side that can ask
  // YouTube; articles come from Wikipedia, whose API is open to us directly.
  // Both run at once, and whichever lands first is drawn first.
  const runSearch = useCallback(async (query: string) => {
    setBusy(true);
    setArticles(null);
    setVideos(null);

    const wiki = (async () => {
      try {
        const api =
          "https://en.wikipedia.org/w/api.php?action=query&generator=search&format=json&origin=*" +
          "&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=2&piprop=thumbnail" +
          "&pithumbsize=48&gsrlimit=10&gsrsearch=" +
          encodeURIComponent(query);
        const json = await (await fetch(api)).json();
        const pages: Record<string, Record<string, unknown>> = json?.query?.pages ?? {};
        setArticles(
          Object.values(pages)
            .map((p) => ({
              title: String(p.title ?? ""),
              extract: String(p.extract ?? ""),
              thumb: (p.thumbnail as { source?: string } | undefined)?.source,
              index: Number(p.index ?? 0),
            }))
            .sort((a, b) => a.index - b.index)
            .filter((r) => isCleanResult(r.title + " " + r.extract)),
        );
      } catch {
        setArticles([]);
      }
    })();

    const vids = (async () => {
      try {
        const res = await searchVideos({ data: { q: query } });
        setVideos(res.videos);
      } catch {
        setVideos([]);
      }
    })();

    await Promise.all([wiki, vids]);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (page.kind === "results") void runSearch(page.query);
  }, [page, runSearch]);

  // A pasted link has not been through a filtered search, so its title is
  // checked before it plays. The window shows the address bar spinner mean-
  // while; the request is cheap and the answer is not cached anywhere.
  const opening = useRef(0);
  const openVideo = async (id: string) => {
    const ticket = ++opening.current;
    setBusy(true);
    try {
      const { ok, title } = await checkVideo({ data: { id } });
      if (ticket !== opening.current) return;
      if (!ok) {
        playSound("error");
        go({ kind: "blocked", reason: "nsfw", host: `youtube.com/watch?v=${id}` });
        return;
      }
      go({ kind: "video", id, title });
    } finally {
      if (ticket === opening.current) setBusy(false);
    }
  };

  const navigate = (raw: string) => {
    const verdict = resolveInput(raw, { ads });
    if (!verdict) return;
    if (!verdict.ok) {
      playSound("error");
      go({ kind: "blocked", reason: verdict.kind, host: verdict.host });
      return;
    }
    // A search that resolved to the engine's URL means it was a query, not an
    // address: run it in-window instead of handing it straight out.
    if (verdict.url.startsWith("https://duckduckgo.com/")) {
      go({ kind: "results", query: raw.trim() });
      return;
    }
    const vid = ytId(verdict.url);
    if (vid) {
      void openVideo(vid);
      return;
    }
    if (isSelf(verdict.url)) {
      go({ kind: "self" });
      return;
    }
    // A site's own player is frameable even when its page is not, so a pasted
    // Spotify or SoundCloud link plays here instead of showing a blank box.
    const embed = toEmbed(verdict.url);
    if (embed) {
      go({ kind: "player", url: embed.url, label: label(verdict.url), site: embed.title });
      return;
    }
    if (refusesFrames(verdict.url)) {
      go({ kind: "refused", url: verdict.url, label: label(verdict.url) });
      return;
    }
    go({ kind: "frame", url: verdict.url, label: label(verdict.url) });
  };

  const openOut = (url: string) => {
    // noopener so the new tab cannot reach back into this one.
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="br">
      <div className="br-bar">
        <button
          className="br-nav"
          disabled={at === 0}
          onClick={() => setAt((i) => Math.max(0, i - 1))}
          aria-label={t("back")}
        >
          ◄
        </button>
        <button
          className="br-nav"
          disabled={at >= history.length - 1}
          onClick={() => setAt((i) => Math.min(history.length - 1, i + 1))}
          aria-label={t("forward")}
        >
          ►
        </button>
        <button
          className="br-nav"
          onClick={() => {
            if (page.kind === "results") void runSearch(page.query);
            else setHistory((h) => [...h]);
          }}
          aria-label={t("reload")}
        >
          ⟳
        </button>
        <button className="br-nav" onClick={() => go({ kind: "home" })} aria-label={t("home")}>
          ⌂
        </button>
        <form
          className="br-addr"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(input);
          }}
        >
          <XPIcon name="globe" size={16} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("addressPlaceholder")}
            spellCheck={false}
            aria-label={t("addressAndSearch")}
          />
          <button type="submit" className="br-go">
            {t("go")}
          </button>
        </form>
      </div>

      <div className="br-view">
        {page.kind === "home" && (
          <div className="br-home">
            <XPIcon name="globe" size={48} />
            <h2>{t("appBrowser")}</h2>
            <p className="br-tag">{t("browserTagline")}</p>
            <form
              className="br-search"
              onSubmit={(e) => {
                e.preventDefault();
                if (input.trim()) navigate(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
              />
              <button className="btn-base btn-primary" type="submit">
                {t("search")}
              </button>
            </form>
            <div className="br-marks">
              {PLACES.map((b) => (
                <button key={b.url} onClick={() => navigate(b.url)} className="br-mark">
                  <XPIcon name="folder" size={32} />
                  <b>{b.label}</b>
                  <em>{b.note}</em>
                </button>
              ))}
            </div>
            <p className="br-plays">{t("browserPlays")}</p>
          </div>
        )}

        {page.kind === "results" && (
          <div className="br-results">
            <div className="br-results-head">
              <span>
                {t("resultsFor")} <b>{page.query}</b>
              </span>
              <button className="br-out" onClick={() => openOut(searchUrl(page.query))}>
                {t("searchWholeWeb")}
              </button>
            </div>

            {busy && !videos && !articles && <p className="br-msg">{t("searching")}</p>}

            {videos && videos.length > 0 && (
              <>
                <h3 className="br-sect">{t("videos")}</h3>
                <div className="br-vids">
                  {videos.map((v) => (
                    <button
                      key={v.id}
                      className="br-vid"
                      onClick={() => go({ kind: "video", id: v.id, title: v.title })}
                    >
                      <span className="br-vid-shot">
                        {v.thumb ? (
                          <img src={v.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        ) : (
                          <XPIcon name="globe" size={32} />
                        )}
                        {v.length && <em>{v.length}</em>}
                      </span>
                      <b>{v.title}</b>
                      <small>{v.channel}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            {articles && articles.length > 0 && <h3 className="br-sect">{t("articles")}</h3>}
            {articles?.map((r) => (
              <button
                key={r.title}
                className="br-result"
                onClick={() =>
                  navigate(
                    "https://en.wikipedia.org/wiki/" +
                      encodeURIComponent(r.title.replace(/ /g, "_")),
                  )
                }
              >
                {r.thumb ? (
                  <img src={r.thumb} alt="" width={40} height={40} />
                ) : (
                  <XPIcon name="notepad" size={32} />
                )}
                <span>
                  <b>{r.title}</b>
                  <em>{r.extract}</em>
                </span>
              </button>
            ))}

            {!busy && !videos?.length && !articles?.length && (
              <p className="br-msg">{t("nothingCameBack")}</p>
            )}
          </div>
        )}

        {page.kind === "video" && (
          <div className="br-player">
            {/* youtube-nocookie is the embed that keeps no viewing record. No
                referrer policy on this one: the player checks who is embedding
                it, and refuses with "error 153" when the header is stripped. */}
            <iframe
              key={page.id}
              src={`https://www.youtube-nocookie.com/embed/${page.id}?rel=0&modestbranding=1&autoplay=1`}
              title={page.title || t("video")}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <div className="br-player-bar">
              <b>{page.title}</b>
              <button
                className="br-out"
                onClick={() => openOut(`https://www.youtube.com/watch?v=${page.id}`)}
              >
                {t("openOnYouTube")}
              </button>
            </div>
          </div>
        )}

        {page.kind === "player" && (
          <div className="br-player">
            {/* The site's own player, which is the one URL it agrees to be
                framed at. No sandbox here: these players need their own
                storage and scripts to run at all, and they are a fixed list of
                addresses we rewrote ourselves rather than anything typed. */}
            <iframe
              key={page.url}
              src={page.url}
              title={page.label}
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
            <div className="br-player-bar">
              <b>{page.site}</b>
              <button className="br-out" onClick={() => openOut(page.url)}>
                {t("openInNewTab")}
              </button>
            </div>
          </div>
        )}

        {page.kind === "refused" && (
          <div className="br-blocked">
            <XPIcon name="globe" size={48} />
            <h2>{t("browserNoFrame").replace("{site}", page.label)}</h2>
            <p className="br-msg">{t("browserNoFrameBody")}</p>
            <button className="btn-base btn-primary" onClick={() => openOut(page.url)}>
              {t("openInNewTab")}
            </button>
          </div>
        )}

        {page.kind === "frame" && (
          <div className="br-frame">
            <iframe
              key={page.url}
              src={page.url}
              title={page.label}
              // No same-origin: the embedded page must not be able to reach
              // this document, our storage, or the opener.
              sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
            {frameNote && (
              <div className="br-note">
                <span>{t("frameRefused").replace("{site}", page.label)}</span>
                <button className="br-out" onClick={() => openOut(page.url)}>
                  {t("openInNewTab")}
                </button>
              </div>
            )}
          </div>
        )}

        {page.kind === "self" && (
          <div className="br-blocked">
            <XPIcon name="folder-open" size={48} />
            <h2>{t("thisMachine")}</h2>
            <p className="br-msg">{t("thisMachineBody")}</p>
          </div>
        )}

        {page.kind === "blocked" && (
          <div className="br-blocked">
            <XPIcon name="mute" size={48} />
            <h2>
              {page.reason === "nsfw"
                ? t("blockedAdult")
                : page.reason === "ads"
                  ? t("blockedAds")
                  : t("blockedScheme")}
            </h2>
            <p className="br-msg">
              {page.reason === "nsfw"
                ? t("filterRefused")
                : page.reason === "ads"
                  ? t("adsRefused")
                  : t("schemeRefused")}
            </p>
            <code>{page.host}</code>
          </div>
        )}
      </div>

      <div className="br-status">
        <span
          className="br-chip is-on is-locked"
          title={`${FILTER_COUNTS.nsfw} ${t("filterHostsNote")}`}
        >
          {t("contentFilterOn")}
        </span>
        <button
          className={`br-chip ${ads ? "is-on" : ""}`}
          onClick={() => setAds((v) => !v)}
          title={`${FILTER_COUNTS.ads} ${t("adsHostsNote")}`}
        >
          {t("adBlocker")} {ads ? t("on") : t("off")}
        </button>
        <span className="br-priv">{t("nothingSaved")}</span>
      </div>
    </div>
  );
}
