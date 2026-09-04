import { BEDS, ambient, useAmbient } from "@/lib/ambient";
import { useT } from "@/lib/i18n";
import { XPIcon } from "@/components/XPIcon";
import { playSound } from "@/lib/sound";

// The mixer's window. Six beds, each with its own level, plus a master and a
// sleep timer. Closing this window does not stop the sound, the engine is at
// module scope and the pinned player keeps the controls within reach.

const SLEEPS = [15, 30, 60, 120];

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function Sounds() {
  const { t } = useT();
  const mix = useAmbient();
  const left = ambient.sleepLeft();
  const live = BEDS.filter((b) => mix.levels[b.id] > 0).length;

  return (
    <div className="sx">
      <div className="sx-head">
        <button
          className="sx-play"
          onClick={() => {
            ambient.toggle();
            playSound("click");
          }}
          aria-pressed={mix.playing}
        >
          {mix.playing ? "❚❚" : "▶"}
        </button>
        <div className="sx-now">
          <b>{mix.playing && live > 0 ? t("soundsPlaying") : t("soundsStopped")}</b>
          <span>{live > 0 ? `${live} ${t("soundsLayers")}` : t("soundsPickOne")}</span>
        </div>
        <label className="sx-master">
          <XPIcon name="speaker" size={16} />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(mix.master * 100)}
            onChange={(e) => ambient.setMaster(+e.target.value / 100)}
            aria-label={t("soundsMaster")}
          />
        </label>
      </div>

      <div className="sx-beds">
        {BEDS.map((bed) => {
          const level = mix.levels[bed.id];
          return (
            <div key={bed.id} className={`sx-bed ${level > 0 ? "is-on" : ""}`}>
              <button
                className="sx-bed-btn"
                onClick={() => {
                  ambient.toggleBed(bed.id);
                  playSound("click");
                }}
                aria-pressed={level > 0}
              >
                <span className="sx-glyph" aria-hidden>
                  {bed.icon}
                </span>
                <span className="sx-name">{t(bed.label)}</span>
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(level * 100)}
                onChange={(e) => ambient.setLevel(bed.id, +e.target.value / 100)}
                aria-label={t(bed.label)}
              />
              <span className="sx-pct">{Math.round(level * 100)}</span>
            </div>
          );
        })}
      </div>

      <div className="sx-foot">
        <span className="label-caps">{t("soundsSleep")}</span>
        {SLEEPS.map((m) => (
          <button
            key={m}
            className={`sx-sleep ${left != null && Math.ceil(left / 60) <= m && mix.fadeAt ? "" : ""}`}
            onClick={() => ambient.setSleep(m)}
          >
            {m}m
          </button>
        ))}
        {left != null ? (
          <button className="sx-sleep is-on" onClick={() => ambient.setSleep(null)}>
            {mmss(left)} ✕
          </button>
        ) : (
          <span className="sx-hint">{t("soundsKeepsPlaying")}</span>
        )}
      </div>
    </div>
  );
}
