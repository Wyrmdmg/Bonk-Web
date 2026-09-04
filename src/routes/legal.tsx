import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { siteUrl } from "@/lib/site";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Terms, privacy and licence" },
      {
        name: "description",
        content:
          "What Bonk stores, what it never collects, and the terms and licence the site is offered under.",
      },
      { property: "og:title", content: "Terms, privacy and licence" },
      {
        property: "og:description",
        content:
          "What Bonk stores, what it never collects, and the terms and licence the site is offered under.",
      },
      { property: "og:url", content: siteUrl("/legal") },
    ],
    links: [{ rel: "canonical", href: siteUrl("/legal") }],
  }),
  component: Legal,
});

// One document, covering this website only. The desktop application ships its
// own separate copy, because it is offline and the two say different things:
// nothing here applies to it, and nothing it says applies here.
//
// Deliberately not translated. These are the terms somebody is held to, and an
// unchecked translation of them is worse than one language anyone can look up.
// The chrome around them follows the site language.
const TERMS = `## Terms

Bonk is a free study timer, run by one person rather than a company, and offered
as is. There is no charge, no subscription, and nothing is sold.

Use it to study. Do not use it to harass anyone, to break the law, or to attack
the service. Rooms and chat are shared spaces: what you put in them, other
people see. Names, avatars and messages that are abusive or sexual can be
removed and the account behind them closed, without notice.

Nothing is promised about uptime. The site runs on a free hosting tier and can
be slow, or down, or lose recent changes. Do not keep anything here that you
cannot afford to lose. The author is not liable for lost work, lost streaks, or
anything that follows from the service being unavailable.

Accounts can be deleted by you at any time from settings.

## Privacy

Only what an account needs.

**Stored:** the email address you sign up with, your username and display name,
your avatar if you upload one, and the study data the site exists to keep:
experience, coins, streaks, focus sessions, rooms you joined, and the messages
you send in them.

**Not stored:** no advertising identifiers, no third party trackers, no
fingerprinting, no analytics profile assembled about you, and no payment details,
because nothing is charged for.

Your email is used to sign you in and, if you ask for one, to send a password
reset. It is never shown to other users, never sold, and never sent to a mailing
list.

Some things are public by design, because the site would not work otherwise:
your username, display name, avatar, level, streaks and position on the
leaderboard are visible to anyone. Messages you send in a room are visible to
everyone in it. Treat a room as a public place.

Data is held by Supabase, the database and authentication provider this site
runs on, and served through Cloudflare. Both act as processors for this site and
are covered by their own privacy policies. There is no other third party.

Cookies and local storage are used to keep you signed in and to remember your
settings, such as language, theme and sound. No advertising or tracking cookies
are set.

Deleting your account removes your profile and its study data. Messages you sent
in shared rooms may remain visible to the people who were there, since they are
part of someone else's conversation too.

## Licence

The site's source code is open and MIT licensed.

Copyright (c) 2026 Bonk

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The pet sprites are licensed art and are not covered by the above. They may not
be redistributed. The fonts are used under the SIL Open Font License.
`;

/** Odd indices are what sat between the asterisks, so they are the bold runs. */
function bold(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => {
    if (i % 2 === 0) return part;
    return <strong key={i}>{part}</strong>;
  });
}

/** The document is a fixed string in this file, never user input, so this only
 *  handles the few marks it actually uses. */
function render(md: string) {
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  const flush = (key: string) => {
    if (!para.length) return;
    out.push(
      <p key={key} className="max-w-[64ch] font-body text-[15px] leading-[1.7]">
        {bold(para.join(" "))}
      </p>,
    );
    para = [];
  };
  md.split("\n").forEach((line, i) => {
    if (line.startsWith("## ")) {
      flush(`p${i}`);
      out.push(
        <h2 key={i} className="mt-10 mb-1 font-display text-[28px] leading-none first:mt-0">
          {line.slice(3)}
        </h2>,
      );
    } else if (!line.trim()) {
      flush(`p${i}`);
    } else {
      para.push(line.trim());
    }
  });
  flush("end");
  return out;
}

function Legal() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  return (
    <AppShell title="legal.txt">
      <div className="px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-col gap-2">
          <span className="label-caps">{t("legalUpdated")}</span>
          <h1 className="font-display text-[48px] leading-none">{t("legalTitle")}</h1>
          <p className="font-body text-[15px] text-[var(--ink-soft)]">{t("legalBlurb")}</p>
        </header>

        <div className="panel p-6 sm:p-8">
          <div className={open ? "" : "relative max-h-[60vh] overflow-hidden"}>
            {render(TERMS)}
            {!open && (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--color-panel)] to-transparent"
                aria-hidden
              />
            )}
          </div>
          {!open && (
            <button onClick={() => setOpen(true)} className="btn-base btn-secondary mt-4">
              {t("legalReadAll")}
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}
