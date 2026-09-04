import { useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  Trash2,
  VolumeX,
  Volume2,
  MessageSquareOff,
  Reply,
  X,
  AtSign,
  Smile,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { useServerFn } from "@tanstack/react-start";
import { notifyMention, moderateChat } from "@/lib/bonks.functions";
import alarmClassicUrl from "@/assets/alarm-classic.wav";

// Ephemeral chat - messages are only kept in memory on each client and are
// broadcast via Supabase Realtime. Nothing is written to the database, so
// when the bonk ends the entire chat vanishes. Mention notifications DO
// persist (via notifyMention server fn) so users see them later.

type ReplyRef = { id: string; username: string; preview: string };
type ChatMsg = {
  id: string;
  user_id: string;
  display_name: string;
  username: string;
  text: string;
  at: number;
  deleted?: boolean;
  mentions?: string[]; // user_ids
  reply?: ReplyRef | null;
};

type Props = {
  bonkId: string;
  hostId: string;
  chatEnabled: boolean;
  slowModeSec: number;
  members: { user_id: string; display_name: string; username: string }[];
};

const MAX_LEN = 500;
const MAX_MESSAGES = 200;

function normalize(input: string) {
  return input
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z]/g, "");
}

// Split "text with @user mentions" into inline nodes.
function renderTextWithMentions(text: string, selfUsername: string | null | undefined) {
  const parts = text.split(/(@[a-zA-Z0-9_]+)/g);
  return parts.map((p, i) => {
    if (p.startsWith("@")) {
      const uname = p.slice(1).toLowerCase();
      const isSelf = !!selfUsername && uname === selfUsername.toLowerCase();
      return (
        <span
          key={i}
          className={`px-1 font-medium ${
            isSelf ? "bg-[var(--flame)] text-[#14140f]" : "bg-[var(--sage)]"
          }`}
        >
          {p}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// Single mention chime cached across renders.
let mentionAudio: HTMLAudioElement | null = null;
function playMentionSound() {
  try {
    if (!mentionAudio) {
      mentionAudio = new Audio(alarmClassicUrl);
      mentionAudio.preload = "auto";
    }
    mentionAudio.currentTime = 0;
    mentionAudio.volume = 0.6;
    void mentionAudio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

export function BonkChat({ bonkId, hostId, chatEnabled, slowModeSec, members }: Props) {
  const { lang, t } = useT();
  const { profile } = useAuth();
  const [myStatus, setMyStatus] = useState<string>(() => {
    try {
      return localStorage.getItem("bonk.status-pref") ?? "online";
    } catch {
      return "online";
    }
  });
  useEffect(() => {
    const t = setInterval(() => {
      try {
        setMyStatus(localStorage.getItem("bonk.status-pref") ?? "online");
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearInterval(t);
  }, []);
  const notify = useServerFn(notifyMention);
  const moderate = useServerFn(moderateChat);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [nextAllowedAt, setNextAllowedAt] = useState(0);
  const [nowTick, setNowTick] = useState(0);
  const [blockedWords, setBlockedWords] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestQ, setSuggestQ] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const myStatusRef = useRef(myStatus);
  useEffect(() => {
    myStatusRef.current = myStatus;
  }, [myStatus]);

  const isHost = profile?.id === hostId;
  const memberMap = useMemo(() => {
    const m = new Map<string, { display_name: string; username: string }>();
    members.forEach((x) =>
      m.set(x.user_id, { display_name: x.display_name, username: x.username }),
    );
    return m;
  }, [members]);
  const membersByUsername = useMemo(() => {
    const m = new Map<string, { user_id: string; display_name: string; username: string }>();
    members.forEach((x) => m.set(x.username.toLowerCase(), x));
    return m;
  }, [members]);

  // Load blocked words once (best-effort - chat still works without it).
  useEffect(() => {
    supabase
      .from("blocked_words")
      .select("word")
      .then(({ data }) => {
        if (data) setBlockedWords(data.map((r) => r.word));
      });
  }, []);

  // Realtime channels - private + member RLS on the chat topic; a separate
  // server-only mod topic delivers host mute/delete events so members
  // cannot spoof moderation actions.
  useEffect(() => {
    if (!chatEnabled || !profile) return;
    const ch = supabase.channel(`bonk-chat-${bonkId}`, {
      config: { broadcast: { self: false }, private: true },
    });
    ch.on("broadcast", { event: "msg" }, ({ payload }) => {
      const m = payload as ChatMsg;
      if (!m || typeof m.text !== "string" || typeof m.user_id !== "string") return;
      // Defence-in-depth: only render if user_id maps to a known member.
      // Realtime RLS binds payload.user_id to the sender's auth.uid, so a
      // spoofed id would be dropped upstream; this guards against any
      // future policy regression.
      if (!memberMap.has(m.user_id)) return;
      setMessages((prev) => {
        if (muted.has(m.user_id)) return prev;
        return [...prev, m].slice(-MAX_MESSAGES);
      });
      if (m.mentions?.includes(profile.id) && myStatusRef.current !== "dnd") {
        playMentionSound();
      }
    });
    ch.subscribe();
    chanRef.current = ch;

    // Mod channel - server-only INSERT via service role.
    const mod = supabase.channel(`bonk-mod-${bonkId}`, { config: { private: true } });
    mod.on("broadcast", { event: "delete" }, ({ payload }) => {
      const { id } = payload as { id: string };
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true } : m)));
    });
    mod.on("broadcast", { event: "mute" }, ({ payload }) => {
      const { user_id } = payload as { user_id: string };
      setMuted((prev) => {
        const n = new Set(prev);
        n.add(user_id);
        return n;
      });
    });
    mod.on("broadcast", { event: "unmute" }, ({ payload }) => {
      const { user_id } = payload as { user_id: string };
      setMuted((prev) => {
        const n = new Set(prev);
        n.delete(user_id);
        return n;
      });
    });
    mod.subscribe();

    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(mod);
      chanRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bonkId, chatEnabled, profile?.id, hostId]);

  useEffect(() => {
    if (!chatEnabled) setMessages([]);
  }, [chatEnabled]);

  useEffect(() => {
    if (nextAllowedAt <= Date.now()) return;
    const t = setInterval(() => setNowTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [nextAllowedAt]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (!chatEnabled) {
    return (
      <div className="panel flex items-center gap-2 p-5 font-mono text-[13px] text-[var(--ink-soft)]">
        <MessageSquareOff className="h-4 w-4" /> {t("chatDisabled")}
      </div>
    );
  }

  const cooldownLeft = Math.max(0, Math.ceil((nextAllowedAt - Date.now()) / 1000));
  void nowTick;

  const resolveMentions = (raw: string): string[] => {
    const ids = new Set<string>();
    const re = /@([a-zA-Z0-9_]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
      const found = membersByUsername.get(m[1].toLowerCase());
      if (found) ids.add(found.user_id);
    }
    return Array.from(ids);
  };

  const send = () => {
    if (!profile) return;
    const trimmed = text.trim().slice(0, MAX_LEN);
    if (!trimmed) return;
    if (Date.now() < nextAllowedAt) return;
    const norm = normalize(trimmed);
    if (blockedWords.some((w) => w && norm.includes(w))) return;
    const mentionIds = resolveMentions(trimmed);
    const msg: ChatMsg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: profile.id,
      display_name: profile.display_name ?? profile.username ?? "user",
      username: profile.username ?? "user",
      text: trimmed,
      at: Date.now(),
      mentions: mentionIds,
      reply: replyTo,
    };
    setMessages((prev) => [...prev, msg].slice(-MAX_MESSAGES));
    chanRef.current?.send({ type: "broadcast", event: "msg", payload: msg });
    // Persist a notification for each mentioned member - this lets people
    // who aren't currently in the chat see the mention in their bell.
    if (mentionIds.length > 0) {
      notify({ data: { bonkId, userIds: mentionIds, preview: trimmed } }).catch(() => {});
    }
    setText("");
    setReplyTo(null);
    setSuggestOpen(false);
    setNextAllowedAt(Date.now() + slowModeSec * 1000);
  };

  const deleteMsg = (id: string) => {
    if (!isHost) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true } : m)));
    moderate({ data: { bonkId, action: "delete", targetMsgId: id } }).catch(() => {});
  };

  const toggleMute = (uid: string) => {
    if (!isHost) return;
    const isMuted = muted.has(uid);
    setMuted((prev) => {
      const next = new Set(prev);
      if (isMuted) next.delete(uid);
      else next.add(uid);
      return next;
    });
    moderate({ data: { bonkId, action: isMuted ? "unmute" : "mute", targetUserId: uid } }).catch(
      () => {},
    );
  };

  // Detect trailing "@partial" for member suggestions.
  const onTextChange = (v: string) => {
    setText(v.slice(0, MAX_LEN));
    const tail = v.slice(0, inputRef.current?.selectionStart ?? v.length);
    const m = tail.match(/(?:^|\s)@([a-zA-Z0-9_]{0,20})$/);
    if (m) {
      setSuggestOpen(true);
      setSuggestQ(m[1].toLowerCase());
    } else setSuggestOpen(false);
  };

  const applySuggestion = (username: string) => {
    const el = inputRef.current;
    const raw = text;
    const pos = el?.selectionStart ?? raw.length;
    const before = raw.slice(0, pos);
    const after = raw.slice(pos);
    const replaced = before.replace(/@([a-zA-Z0-9_]{0,20})$/, `@${username} `);
    setText(replaced + after);
    setSuggestOpen(false);
    setTimeout(() => {
      el?.focus();
      const p = replaced.length;
      el?.setSelectionRange(p, p);
    }, 0);
  };

  const suggestions = suggestOpen
    ? members
        .filter((m) => m.username.toLowerCase().startsWith(suggestQ) && m.user_id !== profile?.id)
        .slice(0, 5)
    : [];

  const startReply = (m: ChatMsg) => {
    setReplyTo({ id: m.id, username: m.username, preview: m.text.slice(0, 80) });
    inputRef.current?.focus();
  };

  return (
    <section className="panel flex h-[440px] flex-col sm:h-[520px]">
      <div className="titlebar">
        <span className="flex items-center gap-2">
          {t("roomChat")}
          {myStatus === "dnd" && <span className="text-[var(--flame)]">{t("dndSilent")}</span>}
        </span>
        <span className="whitespace-nowrap text-[var(--bone-soft)]">
          {t("slow")} {slowModeSec < 60 ? `${slowModeSec}s` : `${Math.round(slowModeSec / 60)}m`} ·{" "}
          {t("ephemeral")}
        </span>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col overflow-y-auto">
        {messages.length === 0 && <p className="label-caps py-10 text-center">{t("noMessages")}</p>}
        {messages.map((m) => {
          const info = memberMap.get(m.user_id);
          const displayName = info?.display_name ?? m.display_name;
          const username = info?.username ?? m.username;
          const isMutedNow = muted.has(m.user_id);
          const mentionsMe = !!profile && m.mentions?.includes(profile.id);
          const isMine = m.user_id === profile?.id;
          return (
            <div
              key={m.id}
              className={`group relative border-b border-[var(--hairline)] px-4 py-2.5 last:border-b-0 ${
                mentionsMe
                  ? "border-l-4 border-l-[var(--flame)] bg-[var(--sage)]"
                  : isMine
                    ? "border-l-4 border-l-[var(--ink)]"
                    : "border-l-4 border-l-transparent"
              }`}
            >
              {m.reply && (
                <div className="mb-1 truncate border-l-2 border-[var(--hairline)] pl-2 font-mono text-[11px] text-[var(--ink-soft)]">
                  <span className="text-[var(--flame)]">@{m.reply.username}</span>
                  <span className="ml-1 opacity-80">{m.reply.preview}</span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <div className="grid h-7 w-7 shrink-0 place-items-center border-2 border-[var(--ink)] bg-[var(--sage)] font-pixel text-[9px]">
                  {initials(displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-mono text-[11px] leading-tight">
                    <span className="truncate">{displayName}</span>
                    <span className="truncate text-[var(--ink-soft)]">@{username}</span>
                    <span className="ml-auto shrink-0 font-data text-[10px] text-[var(--ink-soft)]">
                      {new Date(m.at).toLocaleTimeString(lang, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap break-words font-body text-[14px]">
                    {m.deleted ? (
                      <em className="text-[var(--disabled)]">{t("messageRemoved")}</em>
                    ) : (
                      renderTextWithMentions(m.text, profile?.username)
                    )}
                  </div>
                </div>
              </div>
              {!m.deleted && (
                <div className="absolute right-2 top-2 flex gap-0.5 border-2 border-[var(--ink)] bg-[var(--bone)] opacity-0 group-hover:opacity-100">
                  <button
                    title={t("reply")}
                    onClick={() => startReply(m)}
                    className="p-1 hover:bg-[var(--sage)]"
                  >
                    <Reply className="h-3 w-3" />
                  </button>
                  {isHost && m.user_id !== hostId && (
                    <>
                      <button
                        title={isMutedNow ? t("unmute") : t("mute")}
                        onClick={() => toggleMute(m.user_id)}
                        className="p-1 hover:bg-[var(--sage)]"
                      >
                        {isMutedNow ? (
                          <Volume2 className="h-3 w-3" />
                        ) : (
                          <VolumeX className="h-3 w-3" />
                        )}
                      </button>
                      <button
                        title={t("deleteMessage")}
                        onClick={() => deleteMsg(m.id)}
                        className="p-1 text-[var(--flame)] hover:bg-[var(--sage)]"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {replyTo && (
        <div className="mx-4 mt-3 flex items-center gap-2 border-2 border-[var(--ink)] bg-[var(--sage)] px-2 py-1.5 font-mono text-[11px]">
          <Reply className="h-3 w-3 shrink-0" />
          <span className="shrink-0 text-[var(--ink-soft)]">{t("replyingTo")}</span>
          <span className="shrink-0 text-[var(--flame)]">@{replyTo.username}</span>
          <span className="truncate italic text-[var(--ink-soft)]">{replyTo.preview}</span>
          <button
            onClick={() => setReplyTo(null)}
            className="ml-auto p-0.5 hover:bg-[var(--bone)]"
            aria-label={t("cancelReply")}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="relative border-t-2 border-[var(--ink)] p-4">
        {suggestions.length > 0 && (
          <div className="panel absolute bottom-full left-4 right-16 z-10 mb-1 overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.user_id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(s.username);
                }}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--sage)]"
              >
                <AtSign className="h-3 w-3 text-[var(--flame)]" />
                <span className="font-mono text-[13px]">{s.display_name}</span>
                <span className="label-caps">@{s.username}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
              if (e.key === "Escape") {
                setReplyTo(null);
                setSuggestOpen(false);
                setEmojiOpen(false);
              }
            }}
            placeholder={cooldownLeft > 0 ? `${t("wait")} ${cooldownLeft}s…` : t("messageTheRoom")}
            maxLength={MAX_LEN}
            rows={1}
            className="max-h-32 min-w-0 flex-1 resize-none border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-body text-[14px] outline-none"
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              className="inline-flex items-center justify-center border-2 border-[var(--ink)] px-2 py-2 hover:bg-[var(--sage)]"
              aria-label={t("addEmoji")}
              title={t("addEmoji")}
            >
              <Smile className="h-4 w-4" />
            </button>
            {emojiOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setEmojiOpen(false)} />
                <div className="panel absolute bottom-full right-0 z-40 mb-2 grid max-h-52 w-64 grid-cols-8 gap-1 overflow-y-auto p-2">
                  {[
                    "😀",
                    "😁",
                    "😂",
                    "🤣",
                    "😊",
                    "😍",
                    "😘",
                    "😎",
                    "🤩",
                    "🥳",
                    "😅",
                    "😉",
                    "🙂",
                    "🙃",
                    "😇",
                    "🤔",
                    "🤗",
                    "😴",
                    "🥱",
                    "😪",
                    "😭",
                    "😢",
                    "😡",
                    "🤬",
                    "😱",
                    "🤯",
                    "😳",
                    "🥺",
                    "😬",
                    "😤",
                    "😌",
                    "🤤",
                    "🤠",
                    "🤡",
                    "👻",
                    "💀",
                    "👽",
                    "🤖",
                    "👍",
                    "👎",
                    "👏",
                    "🙌",
                    "🙏",
                    "👀",
                    "💪",
                    "✨",
                    "🔥",
                    "💯",
                    "🎉",
                    "🎊",
                    "💖",
                    "💔",
                    "❤️",
                    "💛",
                    "💚",
                    "💙",
                    "💜",
                    "🖤",
                    "🤍",
                    "🤎",
                    "☕",
                    "🍕",
                    "🍔",
                    "🍟",
                    "🍩",
                    "🍪",
                    "🎂",
                    "🍰",
                    "🍫",
                    "🍬",
                    "🍭",
                    "🍎",
                    "🍇",
                    "🍓",
                    "🍊",
                    "🍋",
                    "🚀",
                    "⭐",
                    "🌙",
                    "☀️",
                    "☁️",
                    "⚡",
                    "🌈",
                    "💤",
                    "📚",
                    "✏️",
                    "💻",
                    "🎮",
                    "🎧",
                    "🎵",
                    "🏆",
                    "🎯",
                    "💎",
                    "🪙",
                  ].map((e) => (
                    <button
                      key={e}
                      type="button"
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        setText((prev) => (prev + e).slice(0, MAX_LEN));
                        inputRef.current?.focus();
                      }}
                      className="grid h-7 w-7 place-items-center text-lg hover:bg-[var(--sage)]"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={send}
            disabled={!text.trim() || cooldownLeft > 0}
            className="btn-base btn-primary shrink-0"
            aria-label={t("send")}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
