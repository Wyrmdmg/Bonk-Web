import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Play,
  ShieldCheck,
  ShieldAlert,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { useAlarm, type AlarmSoundId } from "@/hooks/useAlarm";
import { useT } from "@/lib/i18n";

export function AlarmControls() {
  const { t } = useT();
  const { settings, update, sounds, unlocked, unlock, testBreakStart, testBreakEnd, stop } =
    useAlarm();

  const alarmSilentReason = () =>
    !settings.enabled ? t("alarmIsOff") : settings.muted ? t("alarmIsMuted") : t("volumeIsZero");

  const handleUnlock = async () => {
    const ok = await unlock();
    if (ok) toast.success(t("audioUnlocked"));
    else toast.error(t("audioBlocked"));
  };

  const silent = !settings.enabled || settings.muted || settings.volume <= 0;
  const test = (run: () => boolean) => {
    if (!unlocked) void handleUnlock();
    if (!run()) toast.error(alarmSilentReason());
  };

  return (
    // Laid out as labelled rows rather than one long wrapping strip. The strip
    // broke into ragged lines at every width and the dividers landed in the
    // wrong places once it wrapped.
    <div className="flex w-full flex-col gap-2.5 border-2 border-[var(--ink)] p-3 font-mono text-[11px] uppercase tracking-[0.14em]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="label-caps text-[var(--ink-soft)]">{t("alarm")}</span>

        <button
          onClick={() => update({ enabled: !settings.enabled })}
          aria-pressed={settings.enabled}
          className="inline-flex items-center gap-1.5 border-2 border-[var(--ink)] px-2 py-1"
          style={settings.enabled ? undefined : { opacity: 0.55 }}
        >
          {settings.enabled ? (
            <Bell className="h-3.5 w-3.5" />
          ) : (
            <BellOff className="h-3.5 w-3.5" />
          )}
          {settings.enabled ? t("onCap") : t("offCap")}
        </button>

        <button
          onClick={() => update({ muted: !settings.muted })}
          disabled={!settings.enabled}
          aria-pressed={settings.muted}
          className="inline-flex items-center gap-1.5 border-2 border-[var(--ink)] px-2 py-1 disabled:opacity-40"
          title={settings.muted ? t("unmute") : t("mute")}
        >
          {settings.muted ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
          {settings.muted ? t("muted") : t("sound")}
        </button>

        <label className="inline-flex items-center gap-2">
          <span className="sr-only">{t("alarmVolume")}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            disabled={!settings.enabled || settings.muted}
            onChange={(e) => update({ volume: +e.target.value })}
            className="w-24 accent-[var(--flame)] disabled:opacity-40"
          />
          <span className="w-8 text-right font-data normal-case tracking-normal">
            {Math.round(settings.volume * 100)}
          </span>
        </label>

        <button
          onClick={handleUnlock}
          className="ml-auto inline-flex items-center gap-1.5 border-2 border-[var(--ink)] px-2 py-1"
          style={
            unlocked
              ? undefined
              : { background: "var(--flame)", color: "#14140f", borderColor: "#14140f" }
          }
          title={unlocked ? t("audioUnlockedTab") : t("clickToAllowAudio")}
        >
          {unlocked ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5" />
          )}
          {unlocked ? t("audioOk") : t("enableAudio")}
        </button>

        <button
          onClick={() => stop()}
          className="inline-flex items-center gap-1.5 border-2 border-[var(--ink)] px-2 py-1"
          title={t("stopAlarm")}
        >
          <Square className="h-3 w-3" /> {t("stop")}
        </button>
      </div>

      <div className="grid gap-2 border-t-2 border-[var(--hairline)] pt-2.5 sm:grid-cols-2">
        <SoundPicker
          label={t("breakStart")}
          value={settings.breakStartSound}
          onChange={(id) => update({ breakStartSound: id })}
          onTest={() => test(testBreakStart)}
          sounds={sounds}
        />
        <SoundPicker
          label={t("breakEnd")}
          value={settings.breakEndSound}
          onChange={(id) => update({ breakEndSound: id })}
          onTest={() => test(testBreakEnd)}
          sounds={sounds}
        />
      </div>

      {silent && (
        <p className="normal-case tracking-normal text-[var(--flame)]">{alarmSilentReason()}</p>
      )}
    </div>
  );
}

function SoundPicker({
  label,
  value,
  onChange,
  onTest,
  sounds,
}: {
  label: string;
  value: AlarmSoundId;
  onChange: (id: AlarmSoundId) => void;
  onTest: () => void;
  sounds: { id: AlarmSoundId; name: string }[];
}) {
  const { t } = useT();
  return (
    <label className="flex min-w-0 items-center gap-2">
      <span className="label-caps shrink-0 whitespace-nowrap text-[var(--ink-soft)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AlarmSoundId)}
        className="min-w-0 flex-1 border-2 border-[var(--ink)] px-2 py-1 font-mono text-[11px]"
      >
        {sounds.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onTest}
        className="inline-flex shrink-0 items-center gap-1 border-2 border-[var(--ink)] px-2 py-1"
        title={`${t("test")} ${label}`}
      >
        <Play className="h-3 w-3" /> {t("test")}
      </button>
    </label>
  );
}
