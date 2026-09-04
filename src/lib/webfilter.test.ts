import { expect, test } from "bun:test";
import { isCleanResult, resolveInput, searchUrl, ytId } from "./webfilter";

const on = { ads: true };
const verdict = (input: string, opts = on) => resolveInput(input, opts);

test("a bare phrase is a search, not an address", () => {
  const v = verdict("pomodoro technique");
  expect(v).toEqual({ ok: true, url: searchUrl("pomodoro technique") });
});

test("anything with a dot is an address", () => {
  expect(verdict("example.com")).toEqual({ ok: true, url: "https://example.com/" });
  expect(verdict("https://en.wikipedia.org/wiki/Cat")).toEqual({
    ok: true,
    url: "https://en.wikipedia.org/wiki/Cat",
  });
});

test("search results carry strict SafeSearch", () => {
  expect(searchUrl("anything")).toContain("kp=1");
});

test("adult hosts, subdomains and TLDs are refused", () => {
  for (const host of ["pornhub.com", "www.pornhub.com", "cdn.xvideos.com", "whatever.xxx"]) {
    expect(verdict(host).ok).toBe(false);
  }
});

test("adult words are caught in queries and in paths", () => {
  expect(verdict("free porn").ok).toBe(false);
  expect(verdict("example.com/hentai/1").ok).toBe(false);
});

test("ordinary words survive the filter", () => {
  // The Scunthorpe problem: these are ordinary and must not be casualties.
  // "camp ornament" is the one that matters for stem matching, run together it
  // spells p-o-r-n across the word boundary, so the test has to be per word.
  for (const q of [
    "sexton blake",
    "essex county",
    "middlesex",
    "analysis of poetry",
    "camp ornament",
    "escorted convoy",
    "denudes the hillside",
    "grape",
    "minecraft redstone",
  ]) {
    expect(verdict(q).ok).toBe(true);
  }
});

test("adult stems are caught inside the word, not just as the whole word", () => {
  // This is what let "pornhub" through: whole-word matching passed every
  // derivative of the stem, so the query ran and adult articles came back.
  for (const q of [
    "pornhub",
    "porn hub",
    "porn-hub",
    "pornography",
    "PornHub",
    "best hentai sites",
    "xxx videos",
  ]) {
    expect(verdict(q).ok).toBe(false);
  }
});

test("a brand name with no dot is refused like the address is", () => {
  for (const q of ["pornhub", "xvideos", "onlyfans", "brazzers", "chaturbate", "nhentai"]) {
    expect(verdict(q).ok).toBe(false);
    expect(verdict(q + ".com").ok).toBe(false);
  }
});

test("result screening catches the article text that came back", () => {
  // Verbatim from the leak: the query ran, and every one of these was rendered.
  for (const text of [
    "Pornhub is a Canadian-owned Internet pornography video-sharing website",
    "Money Shot: The Pornhub Story is a 2023 Netflix documentary",
    "an American pornographic film actress and writer",
  ]) {
    expect(isCleanResult(text)).toBe(false);
  }
  expect(isCleanResult("The Pomodoro Technique is a time management method")).toBe(true);
  expect(isCleanResult("A camp ornament from the Bronze Age, analysed in Essex")).toBe(true);
});

test("ad and tracker hosts are refused, and named as ads not as adult", () => {
  const v = verdict("doubleclick.net");
  expect(v).toEqual({ ok: false, kind: "ads", host: "doubleclick.net" });
  expect(verdict("www.google-analytics.com").ok).toBe(false);
});

test("the ad blocker can be turned off; the content filter has no off", () => {
  expect(resolveInput("doubleclick.net", { ads: false })?.ok).toBe(true);
  // There is no option that reaches this, which is the point of the test: the
  // only knob left is `ads`, and it does not touch the adult list.
  expect(resolveInput("pornhub.com", { ads: false })?.ok).toBe(false);
  expect(resolveInput("free porn", { ads: false })?.ok).toBe(false);
});

test("YouTube links of every shape resolve to their video id", () => {
  const id = "dQw4w9WgXcQ";
  for (const link of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `youtube.com/watch?v=${id}`,
  ]) {
    expect(ytId(link)).toBe(id);
  }
});

test("anything that is not a YouTube video is not one", () => {
  for (const link of [
    "https://en.wikipedia.org/wiki/Cat",
    "https://www.youtube.com/",
    "https://www.youtube.com/watch?v=tooshort",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "pomodoro technique",
  ]) {
    expect(ytId(link)).toBeNull();
  }
});

test("only http and https are ever navigable", () => {
  expect(verdict("javascript:alert(1)").ok).toBe(false);
  expect(verdict("data:text/html,<h1>x").ok).toBe(false);
  expect(verdict("file:///etc/passwd").ok).toBe(false);
});

test("empty input goes nowhere", () => {
  expect(verdict("")).toBeNull();
  expect(verdict("   ")).toBeNull();
});

test("result screening rejects adult snippets and keeps ordinary ones", () => {
  expect(isCleanResult("Pomodoro Technique is a time management method")).toBe(true);
  expect(isCleanResult("A porn film studio")).toBe(false);
});
