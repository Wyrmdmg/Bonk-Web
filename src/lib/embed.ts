// Which addresses can actually be shown inside a window, and how.
//
// A site decides for itself whether it may be framed, and most large ones say
// no (X-Frame-Options, or frame-ancestors in a CSP). The browser used to try
// anyway, get a blank rectangle, and put a note under it two and a half seconds
// later. That is the truth but it is a poor way to find it out.
//
// So: the sites people actually paste, YouTube, Spotify, SoundCloud, Vimeo,
// Bandcamp, Apple Music, Twitch, all publish a *player* URL that is meant to
// be framed, even though their main pages are not. Rewriting to that player is
// the difference between "blank" and "it plays". Everything else is checked
// against a list of hosts known to refuse, and those are said so immediately
// with a button to open a real tab, instead of a blank wait.

export type Embed = { url: string; kind: "player" | "page"; title: string };

const clean = (u: URL) => u.hostname.replace(/^www\./, "").toLowerCase();

/** Hosts that refuse to be framed. Saying so up front beats a blank rectangle. */
const REFUSES = [
  "google.com",
  "google.co.uk",
  "accounts.google.com",
  "mail.google.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "threads.net",
  "reddit.com",
  "linkedin.com",
  "amazon.com",
  "netflix.com",
  "tiktok.com",
  "github.com",
  "gitlab.com",
  "stackoverflow.com",
  "discord.com",
  "notion.so",
  "figma.com",
  "chatgpt.com",
  "openai.com",
  "claude.ai",
  "pinterest.com",
  "medium.com",
  "quora.com",
  "whatsapp.com",
  "telegram.org",
];

export const refusesFrames = (url: string) => {
  try {
    const host = clean(new URL(url));
    return REFUSES.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
};

/**
 * The frameable form of an address, or null when the site has no player and no
 * objection, in which case the plain page is tried as it stands.
 */
export function toEmbed(raw: string): Embed | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = clean(u);
  const path = u.pathname;

  // --- YouTube. The watch page refuses; the nocookie player is built for this.
  if (
    host === "youtu.be" ||
    host.endsWith("youtube.com") ||
    host.endsWith("youtube-nocookie.com")
  ) {
    const list = u.searchParams.get("list");
    const id =
      host === "youtu.be"
        ? path.slice(1)
        : (u.searchParams.get("v") ?? /\/(?:embed|shorts|live|v)\/([\w-]{6,})/.exec(path)?.[1]);
    if (id)
      return player(
        `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`,
        "YouTube",
      );
    if (list)
      return player(`https://www.youtube-nocookie.com/embed/videoseries?list=${list}`, "YouTube");
    return null;
  }

  // --- Spotify. /embed/ is the documented, framed player for every entity.
  if (host === "open.spotify.com") {
    const m =
      /^\/(?:intl-[a-z]{2}\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)/.exec(
        path,
      );
    if (m) return player(`https://open.spotify.com/embed/${m[1]}/${m[2]}`, "Spotify");
    return null;
  }

  // --- SoundCloud, via its published widget.
  if (host.endsWith("soundcloud.com")) {
    return player(
      `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.toString())}&color=%23ff5500&visual=false`,
      "SoundCloud",
    );
  }

  // --- Vimeo.
  if (host.endsWith("vimeo.com")) {
    const id = /\/(\d{6,})/.exec(path)?.[1];
    if (id) return player(`https://player.vimeo.com/video/${id}`, "Vimeo");
    return null;
  }

  // --- Bandcamp albums and tracks carry their id in a meta tag we cannot read
  // from here, so only an already-embeddable URL is rewritten.
  if (host.endsWith("bandcamp.com") && path.startsWith("/EmbeddedPlayer")) {
    return player(u.toString(), "Bandcamp");
  }

  // --- Apple Music.
  if (host === "music.apple.com") {
    return player(
      u.toString().replace("//music.apple.com", "//embed.music.apple.com"),
      "Apple Music",
    );
  }

  // --- Twitch needs the embedding host declared, which is the site's own.
  if (host.endsWith("twitch.tv")) {
    const parent = typeof window === "undefined" ? "localhost" : window.location.hostname;
    const chan = path.slice(1).split("/")[0];
    if (chan) return player(`https://player.twitch.tv/?channel=${chan}&parent=${parent}`, "Twitch");
    return null;
  }

  return null;
}

const player = (url: string, title: string): Embed => ({ url, kind: "player", title });

/** Shown on the browser's home page. Every one of these actually frames. */
export const PLACES: { label: string; url: string; note: string }[] = [
  { label: "Wikipedia", url: "https://en.wikipedia.org/wiki/Main_Page", note: "encyclopaedia" },
  { label: "Internet Archive", url: "https://archive.org/", note: "library" },
  { label: "Project Gutenberg", url: "https://www.gutenberg.org/", note: "books" },
  { label: "Open Library", url: "https://openlibrary.org/", note: "books" },
  { label: "MDN", url: "https://developer.mozilla.org/", note: "reference" },
  { label: "Wiktionary", url: "https://en.wiktionary.org/", note: "dictionary" },
];
