import { expect, test } from "bun:test";
import { LIMITS, verdictFromScores, type Scores } from "./moderation.server";

// The score vectors below are what the bundled MobileNetV2 model actually
// returned for these images, not invented numbers. They are the reason the
// thresholds sit where they do: a swimsuit photo scores Sexy 0.82 with the
// explicit classes near zero, so a rule that only watched Porn and Hentai would
// have let it through.
const measured: Record<string, Scores> = {
  cat: { neutral: 0.949, porn: 0.036, hentai: 0.008, sexy: 0.004, drawing: 0.004 },
  beach: { neutral: 0.949, drawing: 0.05, sexy: 0.001, hentai: 0.0, porn: 0.0 },
  ourOwnOgCard: { neutral: 0.97, drawing: 0.026, hentai: 0.004, porn: 0.001, sexy: 0.0 },
  swimsuit: { sexy: 0.822, porn: 0.09, neutral: 0.08, hentai: 0.005, drawing: 0.004 },
  lingerie: { sexy: 0.893, neutral: 0.051, porn: 0.044, drawing: 0.007, hentai: 0.006 },
};

test("ordinary pictures are allowed", () => {
  for (const key of ["cat", "beach", "ourOwnOgCard"]) {
    expect(verdictFromScores(measured[key]).ok).toBe(true);
  }
});

test("suggestive pictures are refused, not just explicit ones", () => {
  for (const key of ["swimsuit", "lingerie"]) {
    const v = verdictFromScores(measured[key]);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("sexual content");
  }
});

test("explicit classes are refused well below a majority", () => {
  // Nothing has to be "mostly" porn to be refused; a third is already too much
  // for a picture shown beside someone's name.
  const v = verdictFromScores({ porn: 0.2, hentai: 0.15, sexy: 0.05, drawing: 0, neutral: 0.6 });
  expect(v.ok).toBe(false);
  expect(v.reason).toBe("explicit content");
});

test("the combined rule catches what neither threshold does alone", () => {
  // Under the explicit limit and under the suggestive limit, over the total.
  const s: Scores = { porn: 0.2, hentai: 0.05, sexy: 0.4, drawing: 0.05, neutral: 0.3 };
  expect(s.porn + s.hentai).toBeLessThan(LIMITS.explicit);
  expect(s.sexy).toBeLessThan(LIMITS.suggestive);
  expect(verdictFromScores(s).ok).toBe(false);
});

test("a picture that is mostly a drawing is still judged on its content", () => {
  expect(
    verdictFromScores({ drawing: 0.6, hentai: 0.35, porn: 0.02, sexy: 0.02, neutral: 0.01 }).ok,
  ).toBe(false);
  expect(
    verdictFromScores({ drawing: 0.95, hentai: 0.02, porn: 0.01, sexy: 0.01, neutral: 0.01 }).ok,
  ).toBe(true);
});
