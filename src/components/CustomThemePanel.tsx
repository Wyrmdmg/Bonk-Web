import { useEffect, useState } from "react";
import { X, Trash2, Check, ExternalLink, Save, Palette, ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useCustomTheme,
  MAX_SLOTS,
  DEFAULT_THEME,
  type CustomTheme,
  applyCustomTheme,
} from "@/hooks/useCustomTheme";
import { useT, type StringKey } from "@/lib/i18n";

type Draft = Omit<CustomTheme, "id"> & { id?: string };

const FIELD_LABELS: { key: keyof CustomTheme; label: StringKey }[] = [
  { key: "accentHighlight", label: "accentHighlight" },
  { key: "primaryText", label: "primaryText" },
  { key: "secondaryText", label: "secondaryText" },
  { key: "panelBackground", label: "panelBackground" },
  { key: "buttonAccent", label: "buttonAccent" },
  { key: "overlayTint", label: "overlayTint" },
  { key: "solidBackground", label: "solidBackground" },
];

export function CustomThemePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const { slots, activeId, saveTheme, deleteTheme, applyThemeId, active } = useCustomTheme();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!open) setDraft(null);
  }, [open]);

  // Live preview while editing (revert on close).
  useEffect(() => {
    if (!draft) return;
    applyCustomTheme({
      ...draft,
      id: draft.id ?? "preview",
      name: draft.name || "Preview",
    } as CustomTheme);
    return () => {
      const act = slots.find((s) => s.id === activeId) ?? null;
      applyCustomTheme(act);
    };
  }, [draft, slots, activeId]);

  const startNew = () => {
    if (slots.length >= MAX_SLOTS) {
      toast.error(`All ${MAX_SLOTS} slots are full. Delete one to make room.`);
      return;
    }
    setDraft({ name: `Theme ${slots.length + 1}`, ...DEFAULT_THEME });
  };
  const editSlot = (s: CustomTheme) => setDraft({ ...s });

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-[color-mix(in_srgb,var(--ink)_70%,transparent)]"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={
          "fixed right-0 top-0 z-[71] flex h-screen w-full max-w-md flex-col border-l-2 border-[var(--ink)] bg-[var(--bone)] transition-transform duration-200 ease-out " +
          (open ? "translate-x-0" : "translate-x-full")
        }
        aria-hidden={!open}
      >
        <div className="flex h-full flex-col">
          <div className="titlebar">
            <span className="flex items-center gap-2">
              <Palette className="h-3.5 w-3.5" /> {t("themeStudio")}
            </span>
            <button onClick={onClose} aria-label={t("close")}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {!draft ? (
              <SlotsView
                slots={slots}
                activeId={activeId}
                onApply={applyThemeId}
                onEdit={editSlot}
                onDelete={(id) => {
                  deleteTheme(id);
                  toast.success(t("themeDeleted"));
                }}
                onNew={startNew}
                onDisable={() => applyThemeId(null)}
              />
            ) : (
              <DraftEditor
                draft={draft}
                onChange={setDraft}
                onCancel={() => setDraft(null)}
                onSave={() => {
                  try {
                    const id = saveTheme(draft);
                    applyThemeId(id);
                    toast.success(t("themeSaved"));
                    setDraft(null);
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : t("failedToSave"));
                  }
                }}
                slotsFull={slots.length >= MAX_SLOTS && !draft.id}
                currentActive={active}
              />
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function SlotsView({
  slots,
  activeId,
  onApply,
  onEdit,
  onDelete,
  onNew,
  onDisable,
}: {
  slots: CustomTheme[];
  activeId: string | null;
  onApply: (id: string) => void;
  onEdit: (s: CustomTheme) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  onDisable: () => void;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="label-caps mb-2">
          {t("yourThemes")} ({slots.length}/{MAX_SLOTS})
        </div>
        {slots.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--hairline)] px-4 py-6 text-center label-caps">
            {t("noCustomThemes")}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {slots.map((s) => {
              const isActive = s.id === activeId;
              return (
                <div
                  key={s.id}
                  className="border-2 border-[var(--ink)] p-3"
                  style={isActive ? { background: "var(--sage)" } : undefined}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="h-12 w-16 flex-shrink-0 border-2 border-[var(--ink)] bg-[var(--sage)]"
                      style={{
                        backgroundImage: s.gifUrl ? `url("${s.gifUrl}")` : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate font-mono text-[13px]">{s.name}</div>
                        {isActive && (
                          <span className="border-2 border-[var(--ink)] bg-[var(--ink)] px-1.5 font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--bone)]">
                            {t("active")}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex gap-1">
                        {[
                          s.accentHighlight,
                          s.primaryText,
                          s.secondaryText,
                          s.panelBackground,
                          s.buttonAccent,
                          s.solidBackground,
                        ]
                          .filter(Boolean)
                          .slice(0, 6)
                          .map((c, i) => (
                            <span
                              key={i}
                              className="h-3 w-3 border-2 border-[var(--ink)]"
                              style={{ background: c }}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onApply(s.id)}
                      className="btn-base btn-secondary"
                      disabled={isActive}
                    >
                      <Check className="mr-1 inline h-3 w-3" />
                      {t("apply")}
                    </button>
                    <button onClick={() => onEdit(s)} className="btn-base btn-tertiary">
                      {t("edit")}
                    </button>
                    <button
                      onClick={() => onDelete(s.id)}
                      className="btn-base btn-tertiary ml-auto text-[var(--flame)]"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onNew}
          disabled={slots.length >= MAX_SLOTS}
          className="btn-base btn-primary flex-1 gap-2"
        >
          <Plus className="h-4 w-4" /> {t("newTheme")}
        </button>
        {activeId && (
          <button onClick={onDisable} className="btn-base btn-tertiary">
            {t("useDefault")}
          </button>
        )}
      </div>
      <p className="font-mono text-[11px] leading-relaxed text-[var(--ink-soft)]">
        {t("themesLiveHere")}
      </p>
    </div>
  );
}

function DraftEditor({
  draft,
  onChange,
  onCancel,
  onSave,
  slotsFull,
  currentActive,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  slotsFull: boolean;
  currentActive: CustomTheme | null;
}) {
  const { t } = useT();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  // The swatch rows all write the same shape, an optional colour string. The
  // generic `set` above cannot prove that for a key that is a whole union, so
  // they get their own non-generic setter rather than a cast.
  const setColor = (k: (typeof FIELD_LABELS)[number]["key"], v: string | undefined) =>
    onChange({ ...draft, [k]: v });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="label-caps mb-1.5">{t("name")}</div>
        <input
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-mono text-[13px] outline-none"
        />
      </div>

      <div>
        <div className="label-caps mb-1.5 flex items-center gap-1.5">
          <ImageIcon className="h-3 w-3" /> {t("backgroundGif")}
        </div>
        <input
          value={draft.gifUrl ?? ""}
          onChange={(e) => set("gifUrl", e.target.value)}
          placeholder={t("pasteGifUrl")}
          className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-mono text-[13px] outline-none"
        />
        <a
          href="https://giphy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="label-caps mt-1.5 inline-flex items-center gap-1"
        >
          {t("browseGiphy")} <ExternalLink className="h-3 w-3" />
        </a>
        <p className="mt-1 font-mono text-[11px] text-[var(--ink-soft)]">{t("giphyHint")}</p>
      </div>

      <div>
        <div className="label-caps mb-2">{t("themeSwatches")}</div>
        <div className="grid grid-cols-1 gap-2">
          {FIELD_LABELS.map(({ key, label }) => (
            <ColorRow
              key={key}
              label={t(label)}
              value={(draft[key] as string | undefined) ?? ""}
              onChange={(v) => setColor(key, v || undefined)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="label-caps">{t("layoutControls")}</div>
        <Slider
          label={t("overlayOpacity")}
          min={0}
          max={100}
          step={1}
          value={draft.overlayOpacity}
          onChange={(v) => set("overlayOpacity", v)}
          suffix="%"
        />
        <Slider
          label={t("glassBlur")}
          min={0}
          max={40}
          step={1}
          value={draft.glassBlur}
          onChange={(v) => set("glassBlur", v)}
          suffix=" px"
        />
        <Slider
          label={t("panelRoundness")}
          min={0}
          max={32}
          step={1}
          value={draft.panelRoundness}
          onChange={(v) => set("panelRoundness", v)}
          suffix=" px"
        />
      </div>

      {slotsFull && (
        <div className="border-2 border-[var(--flame)] bg-[var(--flame)] px-3 py-2 font-mono text-[11px] text-[var(--bone)]">
          {t("slotsFull").replace("{n}", String(MAX_SLOTS))}
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex gap-2 border-t-2 border-[var(--ink)] bg-[var(--bone)] px-5 py-3">
        <button onClick={onCancel} className="btn-base btn-tertiary">
          {t("cancel")}
        </button>
        <button
          onClick={onSave}
          disabled={slotsFull || !draft.name.trim()}
          className="btn-base btn-primary ml-auto gap-1.5"
        >
          <Save className="h-3.5 w-3.5" /> {draft.id ? t("updateApply") : t("saveApply")}
        </button>
      </div>
      {currentActive && !draft.id && <p className="label-caps">{t("livePreview")}</p>}
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useT();
  const safe = /^#([0-9a-fA-F]{3}){1,2}$/.test(value) ? value : "#888888";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-mono text-[13px]">{label}</span>
      <div className="flex items-center gap-2">
        {value && (
          <button
            title={t("clear")}
            onClick={() => onChange("")}
            className="label-caps hover:text-[var(--flame)]"
          >
            {t("clear").toLowerCase()}
          </button>
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#______"
          className="w-20 border-2 border-[var(--ink)] bg-transparent px-2 py-1 font-mono text-[11px]"
        />
        <label
          className="relative h-7 w-10 cursor-pointer overflow-hidden border-2 border-[var(--ink)]"
          style={{ background: value || "transparent" }}
        >
          <input
            type="color"
            value={safe}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
}) {
  return (
    <div>
      <div className="label-caps mb-1 flex items-center justify-between">
        <span>{label}</span>
        <span className="font-data">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full accent-[var(--flame)]"
      />
    </div>
  );
}
