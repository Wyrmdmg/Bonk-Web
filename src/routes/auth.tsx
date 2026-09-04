import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { signInUser, signupUser, resetPasswordWithCode } from "@/lib/auth.functions";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { Copy, Check } from "lucide-react";
import { siteUrl } from "@/lib/site";
import { normalizeGmail } from "@/lib/gmail";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in to Bonk" },
      {
        name: "description",
        content:
          "Create an account with a username and a Gmail address. A recovery code takes the place of a password reset.",
      },
      { property: "og:title", content: "Sign in" },
      {
        property: "og:description",
        content:
          "Create an account with a username and a Gmail address. A recovery code takes the place of a password reset.",
      },
      { property: "og:url", content: siteUrl("/auth") },
    ],
    links: [{ rel: "canonical", href: siteUrl("/auth") }],
  }),
  component: AuthPage,
  validateSearch: (
    s: Record<string, unknown>,
  ): { next?: string; token_hash?: string; type?: string } => ({
    ...(typeof s.next === "string" ? { next: s.next } : {}),
    ...(typeof s.token_hash === "string" ? { token_hash: s.token_hash } : {}),
    ...(typeof s.type === "string" ? { type: s.type } : {}),
  }),
});

// Only allow same-origin relative paths as post-auth redirect targets.
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

type Mode = "login" | "signup" | "reset" | "newpw";

function AuthPage() {
  const { t } = useT();
  const [mode, setMode] = useState<Mode>("login");
  // Filled in by a fresh signup, so the account you just made is already typed
  // into the form you land on.
  const [prefill, setPrefill] = useState("");

  const { token_hash, type } = Route.useSearch();
  const [linkError, setLinkError] = useState<string | null>(null);

  // A reset link lands here with a hash to exchange, rather than being bounced
  // through Supabase's own redirect. That redirect is governed by the project's
  // Site URL, which is a setting in a dashboard nobody remembers changing, and
  // when it is wrong the mail sends people to localhost. This link names this
  // page, so there is nothing left to misconfigure.
  useEffect(() => {
    if (!token_hash || !type) return;
    supabase.auth
      .verifyOtp({ token_hash, type: type as "recovery" })
      .then(({ error }) => {
        if (error) {
          // Land on the tab that can actually issue a new link, so "ask for a
          // new one below" is true rather than aspirational.
          setLinkError(error.message);
          setMode("reset");
          return;
        }
        setMode("newpw");
      })
      .catch(() => {
        setLinkError("");
        setMode("reset");
      });
  }, [token_hash, type]);

  // Links made by the older template still bounce through Supabase, which
  // reports failure in the URL fragment. Without this the page just looked
  // like a normal sign-in form and the mail seemed to do nothing.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const err = hash.get("error_description");
    if (err) {
      setLinkError(err.replace(/\+/g, " "));
      setMode("reset");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // A session that arrives any other way still means one thing only.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("newpw");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <AppShell title="login.sh" bare>
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12 sm:px-8">
        <div className="panel-in w-full max-w-md panel">
          <h1 className="sr-only">{t("signInToBonk")}</h1>
          <div className="titlebar">
            <span>
              {mode === "login"
                ? t("signIn")
                : mode === "signup"
                  ? t("createAccount")
                  : t("resetPassword")}
            </span>
            <span className="text-[var(--bone-soft)]">{t("gmailOnly")}</span>
          </div>
          <div className="flex flex-col gap-6 p-6 sm:p-8">
            {mode !== "newpw" && (
              <div className="grid grid-cols-3">
                {(["login", "signup", "reset"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`border-2 border-[var(--ink)] px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] not-first:border-l-0 ${mode === m ? "seg-on" : ""}`}
                  >
                    {m === "login" ? t("signIn") : m === "signup" ? t("create") : t("forgot")}
                  </button>
                ))}
              </div>
            )}
            {linkError !== null && mode !== "newpw" && (
              <p className="auth-note auth-error">
                {t("resetLinkDead")}
                {linkError ? ` (${linkError})` : ""}
              </p>
            )}
            {mode === "login" && <LoginForm initialWho={prefill} />}
            {mode === "signup" && (
              <SignupForm
                onDone={(username) => {
                  setPrefill(username);
                  setMode("login");
                }}
              />
            )}
            {mode === "reset" && <ResetForm onDone={() => setMode("login")} />}
            {mode === "newpw" && <NewPasswordForm onDone={() => setMode("login")} />}
            <Link to="/" className="label-caps text-center no-underline">
              ← {t("backHome")}
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function LoginForm({ initialWho = "" }: { initialWho?: string }) {
  const { t } = useT();
  const [who, setWho] = useState(initialWho);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const signIn = useServerFn(signInUser);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          // The grant runs on the server so a Gmail address can be resolved to
          // a username without telling the form which accounts exist; the
          // tokens come back here to become a normal browser session.
          const { accessToken, refreshToken } = await signIn({
            data: { who, password },
          });
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "";
          // Keep the generic wording for genuine credential failures so the
          // form can't be used to probe which usernames exist. Anything else
          // (config, rate limit, network) is surfaced as-is, swallowing it
          // made real outages look like a typo.
          return toast.error(
            msg.includes("INVALID_CREDENTIALS") ? t("wrongCredentials") : msg || t("signInFailed"),
          );
        } finally {
          setBusy(false);
        }
        toast.success(t("signedIn"));
        const dest = safeNext(next);
        if (dest) {
          window.location.href = dest;
          return;
        }
        navigate({ to: "/bonks" });
      }}
    >
      <Field label={t("usernameOrEmail")} value={who} onChange={setWho} autoComplete="username" />
      <Field
        label={t("password")}
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="current-password"
      />
      <button className="btn-base btn-primary w-full" disabled={busy || !who || !password}>
        {busy ? t("signingIn") : t("signIn")}
      </button>
    </form>
  );
}

function SignupForm({ onDone }: { onDone: (username: string) => void }) {
  const { t } = useT();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const signup = useServerFn(signupUser);
  const signIn = useServerFn(signInUser);
  const navigate = useNavigate();

  if (recoveryCode) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="label-caps text-[var(--flame)]">{t("saveRecoveryCode")}</div>
          <p className="font-body text-[14px] leading-relaxed text-[var(--ink-soft)]">
            {t("recoveryBlurb")}
          </p>
        </div>
        <div className="border-2 border-[var(--ink)] bg-[var(--flame)] p-4 text-center font-data text-[20px] tracking-[0.18em] text-[#14140f]">
          {recoveryCode}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(recoveryCode);
              setCopied(true);
              toast.success(t("copied"));
            }}
            className="btn-base btn-tertiary flex-1 gap-2"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {t("copy")}
          </button>
          <button
            onClick={async () => {
              try {
                // Through the server function, like every other sign-in, so the
                // account's real auth identity is never built in the browser.
                const { accessToken, refreshToken } = await signIn({
                  data: { who: username, password },
                });
                const { error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                });
                if (error) throw error;
              } catch (err: unknown) {
                // The account exists at this point; only the sign-in failed.
                // Say so, rather than bouncing to a bare form that looks like
                // the signup silently did nothing.
                const msg = err instanceof Error ? err.message : "";
                toast.error(`${t("accountCreatedSignInFailed")} ${msg}`.trim());
                onDone(username);
                return;
              }
              navigate({ to: "/bonks" });
            }}
            className="btn-base btn-primary flex-1"
          >
            {t("savedItContinue")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const res = await signup({
            data: { username, displayName, email, password },
          });
          setRecoveryCode(res.recoveryCode);
          toast.success(t("accountCreated"));
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : t("signupFailed"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field
        label={t("usernamePermanent")}
        value={username}
        onChange={(v) => setUsername(v.toLowerCase())}
        autoComplete="username"
        hint={t("usernameHint")}
      />
      <Field
        label={t("displayName")}
        value={displayName}
        onChange={setDisplayName}
        hint={t("changeLaterHint")}
      />
      <Field
        label={t("emailGmail")}
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
        hint={t("emailGmailHint")}
      />
      <Field
        label={t("password")}
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="new-password"
        hint={t("passwordHint")}
      />
      <button
        className="btn-base btn-primary w-full"
        disabled={busy || !username || !displayName || !email || !password}
      >
        {busy ? t("creating") : t("createAccount")}
      </button>
    </form>
  );
}

// Two ways back in. The link is the one people reach for; the recovery code is
// the only one that works for accounts made before an address was required.
function EmailResetForm() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) return <p className="auth-note">{t("resetEmailSent")}</p>;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        // Supabase answers the same way whether or not the address is known,
        // and so does this, so the form cannot be used to test who has an
        // account here.
        // Canonical form, because that is what the account was created with.
        // Typing f.o.o@gmail.com would otherwise match no user and send
        // nothing, and this form cannot tell you that by design.
        await supabase.auth.resetPasswordForEmail(
          normalizeGmail(email) ?? email.trim().toLowerCase(),
          {
            redirectTo: `${window.location.origin}/auth`,
          },
        );
        setBusy(false);
        setSent(true);
      }}
    >
      <Field
        label={t("emailGmail")}
        value={email}
        onChange={setEmail}
        type="email"
        autoComplete="email"
        hint={t("resetEmailHint")}
      />
      <button className="btn-base btn-primary w-full" disabled={busy || !email}>
        {busy ? t("sending") : t("emailMeALink")}
      </button>
    </form>
  );
}

function NewPasswordForm({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const { error } = await supabase.auth.updateUser({ password });
        setBusy(false);
        if (error) return toast.error(error.message);
        toast.success(t("passwordUpdated"));
        onDone();
      }}
    >
      <p className="auth-note">{t("chooseNewPassword")}</p>
      <Field
        label={t("newPassword")}
        value={password}
        onChange={setPassword}
        type="password"
        autoComplete="new-password"
        hint={t("passwordHint")}
      />
      <button className="btn-base btn-primary w-full" disabled={busy || password.length < 8}>
        {busy ? t("resetting") : t("resetPassword")}
      </button>
    </form>
  );
}

function ResetForm({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const reset = useServerFn(resetPasswordWithCode);
  if (newCode) {
    return (
      <div className="flex flex-col gap-3">
        <div className="font-mono text-[13px]">{t("passwordUpdated")}</div>
        <div className="border-2 border-[var(--ink)] bg-[var(--flame)] p-4 text-center font-data text-[18px] tracking-[0.18em] text-[#14140f]">
          {newCode}
        </div>
        <button onClick={onDone} className="btn-base btn-primary w-full">
          {t("backToSignIn")}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      <EmailResetForm />
      <div className="auth-or">
        <span>{t("orUseCode")}</span>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await reset({
              data: { username: username.toLowerCase(), recoveryCode: code, newPassword: password },
            });
            setNewCode(r.newRecoveryCode);
            toast.success(t("passwordReset"));
          } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : t("resetFailed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("username")} value={username} onChange={setUsername} />
        <Field
          label={t("recoveryCode")}
          value={code}
          onChange={(v) => setCode(v.toUpperCase())}
          hint={t("recoveryCodeHint")}
        />
        <Field label={t("newPassword")} value={password} onChange={setPassword} type="password" />
        <button className="btn-base btn-tertiary w-full" disabled={busy}>
          {busy ? t("resetting") : t("resetWithCode")}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="label-caps mb-1.5">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="w-full border-2 border-[var(--ink)] bg-transparent px-3 py-2 font-mono text-[13px] outline-none"
      />
      {hint && <div className="mt-1 font-mono text-[11px] text-[var(--ink-soft)]">{hint}</div>}
    </label>
  );
}
