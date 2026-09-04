import { useState } from "react";
import { Bell, Check, Trash2, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useT } from "@/lib/i18n";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationBell() {
  const { t } = useT();
  const { profile } = useAuth();
  const { items, unread, markAllRead, markRead, remove, clearAll } = useNotifications(profile?.id);
  const [open, setOpen] = useState(false);

  if (!profile) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center border-2 border-[var(--ink)]"
        aria-label={t("notifications")}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center border-2 border-[var(--ink)] bg-[var(--flame)] px-1 font-data text-[10px] text-[#14140f]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="panel absolute right-0 z-50 mt-2 w-[min(90vw,360px)]">
            <div className="flex items-center justify-between border-b-2 border-[var(--ink)] px-3 py-2">
              <div className="font-display text-[15px]">{t("notifications")}</div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={markAllRead}
                    title={t("markAllRead")}
                    className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-[var(--sage)]"
                  >
                    <Check className="h-3 w-3" /> {t("read")}
                  </button>
                )}
                {items.length > 0 && (
                  <button
                    onClick={clearAll}
                    title={t("clearAll")}
                    className="inline-flex items-center gap-1 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.14em] hover:bg-[var(--sage)]"
                  >
                    <Trash2 className="h-3 w-3" /> {t("clear")}
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center hover:bg-[var(--sage)]"
                  aria-label={t("close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <div className="label-caps px-4 py-10 text-center">{t("allCaughtUp")}</div>
              ) : (
                <ul className="divide-y divide-[var(--hairline)]">
                  {items.map((n) => {
                    const titleMatch = n.title.match(/^(@[a-zA-Z0-9_]+)\s*(.*)$/);
                    const mentionName = titleMatch?.[1] ?? null;
                    const restTitle = titleMatch ? titleMatch[2] : n.title;
                    const content = (
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 ${n.read_at ? "bg-[var(--hairline)]" : "bg-[var(--flame)]"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[13px]">
                            {mentionName && (
                              <span className="text-[var(--flame)]">{mentionName} </span>
                            )}
                            <span>{restTitle}</span>
                          </div>
                          {n.body && (
                            <div className="mt-0.5 line-clamp-2 font-mono text-[11px] text-[var(--ink-soft)]">
                              {n.body}
                            </div>
                          )}
                          <div className="mt-1 font-pixel text-[9px] uppercase tracking-[0.14em] text-[var(--ink-soft)]">
                            {timeAgo(n.created_at)} {t("ago")}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            remove(n.id);
                          }}
                          className="opacity-60 hover:opacity-100"
                          aria-label={t("dismiss")}
                          title={t("dismiss")}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                    const rowClass = "block cursor-pointer px-3 py-2.5 hover:bg-[var(--sage)]";
                    return (
                      <li key={n.id}>
                        {n.link ? (
                          <a
                            href={n.link}
                            onClick={() => {
                              markRead(n.id);
                              setOpen(false);
                            }}
                            className={rowClass}
                          >
                            {content}
                          </a>
                        ) : (
                          <div onClick={() => markRead(n.id)} className={rowClass}>
                            {content}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
