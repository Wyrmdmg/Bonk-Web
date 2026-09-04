import { expect, test } from "bun:test";
import { toEmbed, refusesFrames } from "@/lib/embed";

test("youtube links become the nocookie player", () => {
  for (const u of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30s",
  ]) {
    const e = toEmbed(u);
    expect(e?.url).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1",
    );
  }
});

test("spotify entities become the documented embed path", () => {
  expect(toEmbed("https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT")?.url).toBe(
    "https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT",
  );
  expect(toEmbed("https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3")?.url).toBe(
    "https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3",
  );
  expect(toEmbed("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")?.url).toBe(
    "https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M",
  );
});

test("soundcloud, vimeo and apple music get their players", () => {
  expect(toEmbed("https://soundcloud.com/artist/track")?.url).toContain("w.soundcloud.com/player");
  expect(toEmbed("https://vimeo.com/123456789")?.url).toBe(
    "https://player.vimeo.com/video/123456789",
  );
  expect(toEmbed("https://music.apple.com/us/album/x/123")?.url).toContain("embed.music.apple.com");
});

test("sites that refuse framing are named before they are tried", () => {
  expect(refusesFrames("https://www.instagram.com/x")).toBe(true);
  expect(refusesFrames("https://mail.google.com/")).toBe(true);
  expect(refusesFrames("https://en.wikipedia.org/wiki/Cat")).toBe(false);
});

test("an ordinary page is left alone for the plain frame", () => {
  expect(toEmbed("https://en.wikipedia.org/wiki/Cat")).toBeNull();
  expect(toEmbed("not a url")).toBeNull();
});
