import { useState } from "react";
import { KEYS, exportAll, fromDelimited, importAll, stamp, toDeckNote, toTsv } from "@/lib/backup";
import { addDeck, allCards, decks } from "@/lib/cards";
import { WALLPAPERS, useWallpaper } from "@/lib/wallpaper";
import { DEFAULT_SCHEME, SCHEMES, applyScheme, schemeById, useScheme } from "@/lib/scheme";
import { revealSwap } from "@/lib/reveal";
import { playSound } from "@/lib/sound";
import { useT } from "@/lib/i18n";

// Display Properties. Wallpaper, a flat colour, or the colour scheme. Every
// choice is per browser and comes back on the next visit.

const TINTS = [
  "#2f6f6a",
  "#3a6ea5",
  "#4a7d95",
  "#6b5b8c",
  "#7a4630",
  "#3f6b3f",
  "#5a5a52",
  "#1e2630",
];

export function DisplayProperties() {
  const { id, tint, set } = useWallpaper();
  const scheme = useScheme();
  const { t } = useT();
  const [tab, setTab] = useState<"wall" | "colour" | "appearance" | "data">("wall");

  return (
    <div className="dp">
      <div className="dp-tabs">
        {(["wall", "colour", "appearance", "data"] as const).map((id) => (
          <button key={id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
            {id === "wall"
              ? t("background")
              : id === "colour"
                ? t("colour")
                : id === "appearance"
                  ? t("appearance")
                  : t("dataTitle")}
          </button>
        ))}
      </div>

      <div className="dp-preview" aria-hidden>
        <div className="dp-screen" />
      </div>

      <div className="dp-body">
        {tab === "wall" && (
          <div className="dp-grid">
            {WALLPAPERS.map((w) => (
              <button
                key={w.id}
                className={`dp-swatch ${id === w.id && !tint ? "is-on" : ""}`}
                onClick={() => {
                  set(w.id, null);
                  playSound("click");
                }}
              >
                <span style={{ backgroundColor: w.color, backgroundImage: w.image }} />
                {t(w.name)}
              </button>
            ))}
          </div>
        )}

        {tab === "colour" && (
          <>
            <div className="dp-grid dp-grid-tight">
              {TINTS.map((c) => (
                <button
                  key={c}
                  className={`dp-swatch ${tint === c ? "is-on" : ""}`}
                  onClick={() => {
                    set(null, c);
                    playSound("click");
                  }}
                >
                  <span style={{ backgroundColor: c }} />
                  {c}
                </button>
              ))}
            </div>
            <label className="dp-row">
              {t("pickYourOwn")}
              <input
                type="color"
                value={tint ?? "#4a7d95"}
                onChange={(e) => set(null, e.target.value)}
              />
            </label>
          </>
        )}

        {tab === "appearance" && (
          <div className="dp-appearance">
            <p>{t("schemeBlurb")}</p>
            <div className="dp-schemes">
              {SCHEMES.map((s) => (
                <button
                  key={s.id}
                  className={`dp-scheme ${scheme === s.id ? "is-on" : ""}`}
                  aria-pressed={scheme === s.id}
                  onClick={(e) => {
                    playSound("click");
                    revealSwap(e.currentTarget, s.desk, () => applyScheme(s.id));
                  }}
                >
                  <span className="dp-shot" style={{ background: s.desk }} aria-hidden>
                    <span style={{ background: s.face, borderColor: s.bar }}>
                      <i style={{ background: s.bar }} />
                    </span>
                  </span>
                  {t(s.name)}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "data" && <DataPanel />}
      </div>

      <div className="dp-foot">
        <button
          className="btn-base btn-secondary"
          onClick={() => {
            // Every tab's choice, not just the one you happen to be looking at.
            set(null, null);
            revealSwap(null, schemeById(DEFAULT_SCHEME).desk, () => applyScheme(DEFAULT_SCHEME));
          }}
        >
          {t("resetToDefault")}
        </button>
      </div>
    </div>
  );
}

/**
 * Your work, and getting it out of this browser.
 *
 * Everything the study apps know lives in this browser under a handful of
 * keys, which is fast, private and free, and has exactly one failure mode:
 * clearing site data takes it with it, and so does a different computer. There
 * is no server copy to fall back on, so the honest thing is to say so and put
 * the button that fixes it right underneath.
 *
 * The format is the desktop app's, key for key, so a backup taken here
 * restores there and the other way round.
 */
function DataPanel() {
  const { t } = useT();
  const list = decks.use();
  const [merge, setMerge] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  /** Everything here can be refused by the browser, and a settings pane is not
   *  the place to throw. */
  const run = (job: () => string | null) => {
    try {
      setNote(job());
    } catch (err) {
      setNote(err instanceof Error ? err.message : t("dataFailed"));
    }
  };

  /** A blob and an object URL rather than a data URL: a backup can run to
   *  megabytes, and some browsers cap how long a data URL in an href may be. */
  const download = (text: string, name: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    // Revoked on the next frame, not immediately: revoking in the same tick
    // races the download the click just started, and Safari loses it.
    requestAnimationFrame(() => URL.revokeObjectURL(url));
    return name;
  };

  const pick = (accept: string, onText: (text: string) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) onText(await file.text());
    };
    input.click();
  };

  return (
    <div className="dp-appearance">
      <section className="dp-data">
        <h3>{t("dataTitle")}</h3>
        <p>{t("dataWebBlurb")}</p>
        <div className="dp-data-row">
          <button
            className="btn-base btn-primary"
            onClick={() =>
              run(() => {
                const at = download(
                  JSON.stringify(exportAll(), null, 2),
                  `bonk-backup-${stamp()}.json`,
                  "application/json",
                );
                return `${t("savedState")}: ${at}`;
              })
            }
          >
            {t("dataExport")}
          </button>
          <button
            className="btn-base btn-secondary"
            onClick={() =>
              pick(".json,application/json", (text) =>
                run(() => {
                  const { restored } = importAll(JSON.parse(text), merge ? "merge" : "replace");
                  // Every store caches its value, and the import wrote the keys
                  // underneath all of them. A reload is the one thing that is
                  // certainly correct, and a restore is rare enough to spend it.
                  if (restored.length) setTimeout(() => window.location.reload(), 600);
                  return `${t("dataRestored")}: ${restored.length}`;
                }),
              )
            }
          >
            {t("dataImport")}
          </button>
        </div>
        <label className="dp-check">
          <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
          {t("dataMerge")}
        </label>
        <p className="dp-hint">{t("dataMergeHint")}</p>
        <p className="dp-hint">
          {t("dataCovers")} {KEYS.length}
        </p>
      </section>

      <section className="dp-data">
        <h3>{t("dataCards")}</h3>
        <p>{t("dataCardsWebBlurb")}</p>
        <div className="dp-data-row">
          <button
            className="btn-base btn-secondary"
            onClick={() =>
              run(() => {
                const pairs = allCards(list).map((c) => ({ q: c.q, a: c.a }));
                if (!pairs.length) return t("dataNoCards");
                return `${t("savedState")}: ${download(
                  toTsv(pairs),
                  `bonk-cards-${stamp()}.tsv`,
                  "text/tab-separated-values",
                )}`;
              })
            }
          >
            {t("dataExportCards")}
          </button>
          <button
            className="btn-base btn-secondary"
            onClick={() =>
              pick(".tsv,.csv,.txt,text/plain", (text) =>
                run(() => {
                  const pairs = fromDelimited(text);
                  if (!pairs.length) return t("dataNoCards");
                  const name = `Imported ${stamp()}`;
                  addDeck(name, toDeckNote(name, pairs));
                  return `${pairs.length} ${t("dataImported")} ${name}`;
                }),
              )
            }
          >
            {t("dataImportCards")}
          </button>
        </div>
      </section>

      {note && <p className="dp-data-note">{note}</p>}
    </div>
  );
}
