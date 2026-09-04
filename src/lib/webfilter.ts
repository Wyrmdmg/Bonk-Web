// Navigation filtering for the browser window.
//
// The content filter is not a setting. There is no flag to pass and no switch
// in the UI, so there is no path through this module that skips it: every
// address, every query and every result title goes through the same screen.
//
// What this genuinely does: refuses to open adult and known ad/tracker hosts,
// and forces strict SafeSearch onto every search it hands off.
//
// What it cannot do, and the UI says so rather than pretending otherwise: strip
// ads from *inside* an embedded page. A page on one origin cannot read or edit
// a frame on another, so once a site is displayed its own ads are its own. Real
// in-page blocking needs an extension or a proxy, neither of which a web app is.

const NSFW_HOSTS = [
  "pornhub.com",
  "xvideos.com",
  "xnxx.com",
  "xhamster.com",
  "redtube.com",
  "youporn.com",
  "spankbang.com",
  "chaturbate.com",
  "stripchat.com",
  "onlyfans.com",
  "fansly.com",
  "rule34.xxx",
  "e621.net",
  "nhentai.net",
  "hanime.tv",
  "brazzers.com",
  "bangbros.com",
  "erome.com",
  "motherless.com",
  "thisvid.com",
];

/**
 * Stems that are adult wherever they appear inside a word. Whole-word matching
 * alone let "pornhub", "pornography" and "pornographic" straight through, which
 * is most of what an adult search actually returns.
 *
 * The test is per word, never across the whole string: run together, "camp
 * ornament" contains "porn", and a filter that blocks camping trips is a filter
 * people turn off.
 */
const NSFW_STEMS = [
  "porn",
  "hentai",
  "nsfw",
  "xxx",
  "camgirl",
  "camwhore",
  "milf",
  "creampie",
  "blowjob",
  "handjob",
  "cumshot",
  "deepthroat",
  "gangbang",
  "bukkake",
  "sexcam",
  "camsex",
  "sextape",
  "rule34",
  "boobs",
  "titties",
  "upskirt",
  "fleshlight",
];

/** Ambiguous on their own, so these match as whole words only: "escort" must
 *  not take "escorted", and "nudes" must not take "denudes". */
const NSFW_WORDS = ["escort", "escorts", "nude", "nudes", "stripper", "camming", "erotica"];

const AD_HOSTS = [
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
  "adservice.google.com",
  "google-analytics.com",
  "googletagmanager.com",
  "adnxs.com",
  "adsrvr.org",
  "criteo.com",
  "taboola.com",
  "outbrain.com",
  "scorecardresearch.com",
  "quantserve.com",
  "moatads.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "casalemedia.com",
  "zedo.com",
  "popads.net",
  "propellerads.com",
  "adcash.com",
  "hotjar.com",
  "mixpanel.com",
  "segment.io",
];

/** Adult top level domains, which exist for exactly one purpose. */
const NSFW_TLDS = [".xxx", ".adult", ".porn", ".sex", ".sexy", ".cam"];

const hostMatches = (host: string, list: string[]) =>
  list.some((d) => host === d || host.endsWith("." + d));

/** The brand half of every adult host, so typing "pornhub" with no dot is the
 *  same refusal as typing pornhub.com. One list to keep, not two. */
const NSFW_BRANDS = NSFW_HOSTS.map((h) => h.split(".")[0]).filter((b) => b.length >= 4);

const wordMatches = (text: string) => {
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return words.some(
    (w) =>
      w.length > 0 &&
      (NSFW_STEMS.some((stem) => w.includes(stem)) ||
        NSFW_BRANDS.includes(w) ||
        NSFW_WORDS.includes(w)),
  );
};

export type BlockKind = "nsfw" | "ads" | "scheme";
export type Verdict = { ok: true; url: string } | { ok: false; kind: BlockKind; host: string };

/** Schemes that are never a destination, whatever else the input looks like. */
const BAD_SCHEMES = ["javascript", "data", "vbscript", "file", "blob", "about", "chrome"];

/**
 * Turns whatever was typed into a destination, or refuses it.
 * A bare word is a search; anything with a dot or a scheme is a URL.
 */
export function resolveInput(input: string, opts: { ads: boolean }): Verdict | null {
  const raw = input.trim();
  if (!raw) return null;

  // Named explicitly rather than inferred. A general "any scheme that is not
  // http" rule would refuse ordinary queries like "note: buy milk", and these
  // are the ones that actually matter.
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (scheme && BAD_SCHEMES.includes(scheme[1].toLowerCase())) {
    return { ok: false, kind: "scheme", host: `${scheme[1]}:` };
  }

  const looksLikeUrl = /^[a-z]+:\/\//i.test(raw) || /^[\w-]+(\.[\w-]+)+(\/|$|:)/.test(raw);
  if (!looksLikeUrl) {
    if (wordMatches(raw)) return { ok: false, kind: "nsfw", host: raw };
    return { ok: true, url: searchUrl(raw) };
  }

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: true, url: searchUrl(raw) };
  }
  // Belt and braces for anything the scheme list above did not name.
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, kind: "scheme", host: url.protocol };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (opts.ads && hostMatches(host, AD_HOSTS)) return { ok: false, kind: "ads", host };
  if (
    hostMatches(host, NSFW_HOSTS) ||
    NSFW_TLDS.some((t) => host.endsWith(t)) ||
    wordMatches(host + " " + url.pathname)
  ) {
    return { ok: false, kind: "nsfw", host };
  }
  return { ok: true, url: url.toString() };
}

/** DuckDuckGo with strict SafeSearch pinned on (kp=1). */
export function searchUrl(query: string) {
  return `https://duckduckgo.com/?kp=1&kl=wt-wt&q=${encodeURIComponent(query)}`;
}

/** Titles and snippets that come back from a search still get screened. */
export function isCleanResult(text: string) {
  return !wordMatches(text);
}

export const FILTER_COUNTS = { nsfw: NSFW_HOSTS.length, ads: AD_HOSTS.length };

/** The video id in any shape of YouTube link, or null if it is not one. */
export function ytId(raw: string): string | null {
  const ok = (v: string | null) => (v && /^[\w-]{11}$/.test(v) ? v : null);
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") return ok(url.pathname.slice(1));
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (url.pathname === "/watch") return ok(url.searchParams.get("v"));
  const m = /^\/(?:shorts|embed|live|v)\/([^/?#]+)/.exec(url.pathname);
  return m ? ok(m[1]) : null;
}
