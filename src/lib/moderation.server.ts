// Image moderation for anything a user can put in front of other users.
//
// Two providers, tried in order, and the answer is never "we could not check,
// so go ahead":
//
//   1. Azure AI Content Safety, when AZURE_CONTENT_SAFETY_ENDPOINT and
//      AZURE_CONTENT_SAFETY_KEY are set. A hosted service, kept current by
//      someone whose job that is, and the one to prefer in production.
//   2. NSFWJS (MobileNetV2) run here. The weights ship inside the package, so
//      there is no key to hold, no request to make and no cold-start download.
//
// If neither can answer, the upload is refused. A scanner that waves images
// through when it is unavailable is not a scanner.
//
// On what this is not: PhotoDNA matches known child sexual abuse imagery by
// hash, and Microsoft grants access to it under a signed agreement rather than
// an API key, so it cannot be wired up from here. It is the right tool for that
// specific job and is worth applying for; this module is where it would go.
// Neither provider below is a CSAM detector, and neither should be described as
// one. Reports still need a route to a human and to NCMEC.

export type Scores = {
  porn: number;
  hentai: number;
  sexy: number;
  drawing: number;
  neutral: number;
};

export type Verdict =
  | { ok: true; by: "azure" | "local"; scores?: Scores }
  | { ok: false; by: "azure" | "local" | "none"; reason: string; scores?: Scores };

/**
 * Where the line sits for a profile picture, which is shown beside someone's
 * name all over the site and is not a place for a judgement call.
 *
 * Measured against the model to set these: a cat photo and our own OG card both
 * score neutral above 94%; a swimsuit photo comes back Sexy 82% and a lingerie
 * photo Sexy 89%. So "sexy" alone has to be enough to refuse, not just the
 * explicit classes.
 */
export const LIMITS = { explicit: 0.3, suggestive: 0.5, combined: 0.6 };

export function verdictFromScores(s: Scores): { ok: boolean; reason: string } {
  const explicit = s.porn + s.hentai;
  if (explicit >= LIMITS.explicit) return { ok: false, reason: "explicit content" };
  if (s.sexy >= LIMITS.suggestive) return { ok: false, reason: "sexual content" };
  if (explicit + s.sexy >= LIMITS.combined) return { ok: false, reason: "sexual content" };
  return { ok: true, reason: "" };
}

// ---- Azure AI Content Safety -----------------------------------------------

/** Azure grades 0/2/4/6 per category. 2 is "low", and a profile picture has no
 *  reason to reach even that. */
const AZURE_MAX_SEVERITY = 0;

async function azureScan(base64: string): Promise<Verdict | null> {
  const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
  const key = process.env.AZURE_CONTENT_SAFETY_KEY;
  if (!endpoint || !key) return null;
  try {
    const res = await fetch(
      `${endpoint.replace(/\/$/, "")}/contentsafety/image:analyze?api-version=2024-09-01`,
      {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ image: { content: base64 } }),
      },
    );
    if (!res.ok) {
      console.error("[moderation] azure http", res.status, await res.text().catch(() => ""));
      return null; // fall through to the local model rather than failing the user
    }
    const json = (await res.json()) as {
      categoriesAnalysis?: { category: string; severity: number }[];
    };
    const hit = (json.categoriesAnalysis ?? []).find((c) => c.severity > AZURE_MAX_SEVERITY);
    if (!hit) return { ok: true, by: "azure" };
    return { ok: false, by: "azure", reason: hit.category.toLowerCase() };
  } catch (err) {
    console.error("[moderation] azure", err);
    return null;
  }
}

// ---- Local model ------------------------------------------------------------

// Held for the life of the instance: loading costs about a second, classifying
// costs about the same, and neither should be paid twice on a warm one.
let modelPromise: Promise<{
  classify: (t: never) => Promise<{ className: string; probability: number }[]>;
} | null> | null = null;

async function localModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        const tf = await import("@tensorflow/tfjs");
        // "nsfwjs/core", not "nsfwjs": the package entry pulls in its registry of
        // all three models, and InceptionV3 alone is 30 MB of weights we never
        // ask for. The core entry plus the one model is 3 MB.
        const { load } = await import("nsfwjs/core");
        const { MobileNetV2Model } = await import("nsfwjs/models/mobilenet_v2");
        await tf.setBackend("cpu");
        await tf.ready();
        // The package's own `load` type omits modelDefinitions, which its core
        // accepts and which is the whole point of the bundled model: no CDN.
        const opts = { size: 224, modelDefinitions: [MobileNetV2Model] } as Parameters<
          typeof load
        >[1];
        return (await load("MobileNetV2", opts)) as unknown as {
          classify: (t: never) => Promise<{ className: string; probability: number }[]>;
        };
      } catch (err) {
        console.error("[moderation] local model failed to load", err);
        return null;
      }
    })();
  }
  return modelPromise;
}

async function localScan(bytes: Uint8Array): Promise<Verdict | null> {
  const model = await localModel();
  if (!model) return null;
  try {
    const tf = await import("@tensorflow/tfjs");
    const jpeg = await import("jpeg-js");
    const { data, width, height } = jpeg.decode(bytes, { useTArray: true });
    // jpeg-js hands back RGBA; the model wants RGB.
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
    const tensor = tf.tensor3d(rgb, [height, width, 3]);
    let preds: { className: string; probability: number }[];
    try {
      preds = await model.classify(tensor as never);
    } finally {
      tensor.dispose();
    }
    const at = (name: string) =>
      preds.find((p) => p.className.toLowerCase() === name)?.probability ?? 0;
    const scores: Scores = {
      porn: at("porn"),
      hentai: at("hentai"),
      sexy: at("sexy"),
      drawing: at("drawing"),
      neutral: at("neutral"),
    };
    const call = verdictFromScores(scores);
    return call.ok
      ? { ok: true, by: "local", scores }
      : { ok: false, by: "local", reason: call.reason, scores };
  } catch (err) {
    console.error("[moderation] local scan", err);
    return null;
  }
}

/**
 * Screens a JPEG. `bytes` is the decoded image, `base64` the same thing in the
 * form Azure wants, so the caller does not encode it twice.
 */
export async function scanImage(bytes: Uint8Array, base64: string): Promise<Verdict> {
  const azure = await azureScan(base64);
  if (azure) return azure;
  const local = await localScan(bytes);
  if (local) return local;
  return {
    ok: false,
    by: "none",
    reason: "the content scanner is unavailable",
  };
}
