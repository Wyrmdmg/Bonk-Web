import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AvatarPic } from "@/components/AvatarPic";
import { BadgeChip } from "@/components/BadgeChip";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { deleteMyAccount, updateDisplayName } from "@/lib/auth.functions";
import { updateAvatarUrl, uploadAvatarImage, equipBadge } from "@/lib/badges.functions";
import { useMyBadges } from "@/hooks/useBadges";
import { getBadge, formatBadgeRemaining } from "@/lib/badges";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Camera, Upload } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({ component: Settings });

const AVATAR_MAX_PX = 512;
const AVATAR_SOURCE_MAX_BYTES = 25 * 1024 * 1024; // what we will bother decoding

// Re-encode whatever the browser can decode (HEIC straight off an iPhone included)
// into a small JPEG. The server only accepts png/jpg/gif/webp, and a raw photo
// base64s into a request body big enough to be rejected outright, so both of the
// ways this used to fail are gone once we normalise here.
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image. Try a PNG or JPG."));
      el.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) throw new Error("Could not read that image. Try a PNG or JPG.");
    const scale = Math.min(1, AVATAR_MAX_PX / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process that image.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Settings() {
  const { t } = useT();
  const { profile, user, loading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rename = useServerFn(updateDisplayName);
  const del = useServerFn(deleteMyAccount);
  const saveAvatar = useServerFn(updateAvatarUrl);
  const uploadAvatar = useServerFn(uploadAvatarImage);
  const equipBadgeFn = useServerFn(equipBadge);
  const myBadges = useMyBadges(profile?.id);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
    if (profile) setDisplayName(profile.display_name);
  }, [loading, user, profile, navigate]);

  if (!profile)
    return (
      <AppShell title="settings.cfg">
        <p className="label-caps p-8">{t("signInForSettings")}</p>
      </AppShell>
    );

  const displayed = previewUrl ?? profile.avatar_url;

  const onFile = async (file: File) => {
    if (!user) return;
    // Some pickers hand back an empty type for formats they do not name; let the
    // decode below be the judge rather than rejecting the file up front.
    if (file.type && !/^image\//.test(file.type)) {
      toast.error(t("pickAnImage"));
      return;
    }
    if (file.size > AVATAR_SOURCE_MAX_BYTES) {
      toast.error(t("imageTooBig"));
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await toAvatarDataUrl(file);
      const { path } = await uploadAvatar({ data: { dataUrl } });
      setPreviewUrl(path);
      window.dispatchEvent(new CustomEvent("bonk:profile-updated"));
      toast.success(t("avatarUpdated"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const onRemoveAvatar = async () => {
    setUploading(true);
    try {
      await saveAvatar({ data: { avatarPath: null } });
      setPreviewUrl(null);
      window.dispatchEvent(new CustomEvent("bonk:profile-updated"));
      toast.success(t("avatarRemoved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppShell title="settings.cfg">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-2">
          <span className="label-caps">@{profile.username}</span>
          <h1 className="font-display text-[48px] leading-none">{t("settings")}</h1>
        </header>

        <section className="panel">
          <div className="titlebar">
            <span>{t("profilePicture")}</span>
          </div>
          <div className="flex items-center gap-4 p-6">
            <AvatarPic url={displayed} name={profile.display_name} size="xl" />
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.currentTarget.value = "";
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="btn-base btn-primary gap-2"
              >
                {uploading ? (
                  <Camera className="h-4 w-4 sprite-idle" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? t("uploading") : t("uploadNew")}
              </button>
              {displayed && (
                <button
                  onClick={onRemoveAvatar}
                  disabled={uploading}
                  className="label-caps text-left hover:text-[var(--flame)]"
                >
                  {t("removePicture")}
                </button>
              )}
              <p className="max-w-xs font-mono text-[11px] text-[var(--ink-soft)]">
                {t("avatarHint")}
              </p>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="titlebar">
            <span>{t("identity")}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
            <div className="min-w-0">
              <div className="label-caps">{t("usernamePermanent")}</div>
              <div className="truncate font-mono text-[13px]">@{profile.username}</div>
            </div>
            <div className="min-w-0">
              <div className="label-caps">{t("email")}</div>
              <div className="truncate font-mono text-[13px]">
                {profile.email ?? <span className="text-[var(--disabled)]">{t("none")}</span>}
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="titlebar">
            <span>{t("displayName")}</span>
          </div>
          <div className="flex flex-col gap-3 p-6">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full min-w-0 border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-mono text-[13px] outline-none sm:flex-1"
              />
              <button
                disabled={busy || displayName === profile.display_name}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await rename({ data: { displayName } });
                    toast.success(t("updated"));
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : t("failed"));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="btn-base btn-primary"
              >
                {t("save")}
              </button>
            </div>
            <p className="label-caps">{t("displayNameFiltered")}</p>
          </div>
        </section>

        <section className="panel">
          <div className="titlebar">
            <span>{t("myBadges")}</span>
            <a href="/shop" className="text-[var(--bone-soft)] no-underline">
              {t("shop")} →
            </a>
          </div>
          <div className="flex flex-col gap-3 p-6">
            {myBadges.badges.length === 0 ? (
              <p className="font-mono text-[13px] text-[var(--ink-soft)]">{t("noBadgesYet")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {myBadges.badges.map((b) => {
                  const def = getBadge(b.badge_key);
                  if (!def) return null;
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 border-2 border-[var(--ink)] px-3 py-2"
                    >
                      <img
                        src={def.url}
                        alt={t(def.name)}
                        width={40}
                        height={40}
                        className="pixel shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-[13px]">{t(def.name)}</div>
                        <div className="line-clamp-1 font-mono text-[11px] text-[var(--ink-soft)]">
                          {t(def.perk)}
                        </div>
                        <div className="label-caps">{formatBadgeRemaining(b.expires_at)}</div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await equipBadgeFn({
                              data: { badgeKey: b.equipped ? "" : b.badge_key },
                            });
                            toast.success(
                              b.equipped ? t("unequipped") : `${t(def.name)} ${t("equippedLower")}`,
                            );
                            myBadges.refresh();
                          } catch (e: unknown) {
                            toast.error(e instanceof Error ? e.message : t("failed"));
                          }
                        }}
                        className={`btn-base btn-tertiary shrink-0 ${b.equipped ? "seg-on" : ""}`}
                      >
                        {b.equipped ? t("equipped") : t("equip")}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {myBadges.equipped && (
              <div className="label-caps flex items-center gap-2">
                {t("previewNextToName")}
                <BadgeChip
                  badgeKey={myBadges.equipped.badge_key}
                  size="sm"
                  expiresAt={myBadges.equipped.expires_at}
                />
              </div>
            )}
          </div>
        </section>

        <section className="panel" style={{ borderColor: "var(--flame)" }}>
          <div className="titlebar" style={{ background: "var(--flame)" }}>
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" /> {t("dangerZone")}
            </span>
          </div>
          <div className="flex flex-col gap-3 p-6">
            <p className="font-body text-[14px] leading-relaxed text-[var(--ink-soft)]">
              {t("deleteAccountBlurb")}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                placeholder={t("typeToConfirm").replace("{name}", profile.username)}
                value={confirmDelete}
                onChange={(e) => setConfirmDelete(e.target.value)}
                className="w-full min-w-0 border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-mono text-[13px] outline-none sm:flex-1"
              />
              <button
                disabled={confirmDelete !== profile.username || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await del({});
                    await supabase.auth.signOut();
                    toast.success(t("accountDeleted"));
                    navigate({ to: "/" });
                  } catch (e: unknown) {
                    toast.error(e instanceof Error ? e.message : t("failed"));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="btn-base btn-primary"
                style={{ background: "var(--flame)" }}
              >
                {t("deleteAccount")}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
