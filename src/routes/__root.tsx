import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import { supabase } from "@/lib/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { MascotHost } from "@/components/MascotPopup";
import { AppShell } from "@/components/AppShell";
import { useT } from "@/lib/i18n";
import { Desktop } from "@/components/desktop/Desktop";
import { UpdateBar } from "@/components/UpdateBar";
import { WindowProvider } from "@/lib/windows";
import { applyWallpaper, WALL_KEY, WALL_TINT_KEY } from "@/lib/wallpaper";
import { PinnedRail } from "@/components/PinnedRail";
import { BootScreen } from "@/components/BootScreen";
import { useLockdown } from "@/hooks/useLockdown";
import { useCustomTheme } from "@/hooks/useCustomTheme";
import { SITE_URL } from "@/lib/site";

function CustomThemeMount() {
  useCustomTheme();
  return null;
}

// The wallpaper is stored per browser and painted on <html>, so it survives a
// route change without the desktop re-reading storage on every navigation.
function WallpaperMount() {
  useEffect(() => {
    try {
      applyWallpaper(localStorage.getItem(WALL_KEY), localStorage.getItem(WALL_TINT_KEY));
    } catch {
      /* private mode: the default wallpaper stands */
    }
  }, []);
  return null;
}

function NotFoundComponent() {
  const { t } = useT();
  return (
    <AppShell title="404.err">
      <div className="flex flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="font-display text-[64px] leading-none">404</h1>
        <h2 className="font-display text-[24px] leading-none">{t("lostInTheBonk")}</h2>
        <p className="label-caps">{t("nothingToFocusOn")}</p>
        <Link to="/" className="btn-base btn-primary no-underline">
          {t("goHome")}
        </Link>
      </div>
    </AppShell>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md">
        <div className="titlebar" style={{ background: "var(--flame)" }}>
          <span>{t("somethingBroke")}</span>
        </div>
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          <p className="font-mono text-[13px] text-[var(--ink-soft)]">{error.message}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className="btn-base btn-primary"
            >
              {t("tryAgain")}
            </button>
            <a href="/" className="btn-base btn-tertiary no-underline">
              {t("goHome")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bonk, shared focus timer" },
      {
        name: "description",
        content:
          "A shared focus timer. Start one on your own, or open a room your friends can join.",
      },
      // The card already prints the site name above the title, so the title
      // beside it says what this is rather than saying "Bonk" a second time.
      { property: "og:site_name", content: "Bonk" },
      { property: "og:title", content: "Shared focus timer" },
      {
        property: "og:description",
        content:
          "A shared focus timer. Start one on your own, or open a room your friends can join.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Shared focus timer" },
      {
        name: "twitter:description",
        content:
          "A shared focus timer. Start one on your own, or open a room your friends can join.",
      },
      // Our own card, drawn from scripts/og-card.html, rather than an upload on
      // a host we do not control.
      { property: "og:image", content: `${SITE_URL}/og.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "The Bonk desktop with the Bonk window open on it" },
      { name: "twitter:image", content: `${SITE_URL}/og.png` },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // The design's four faces. Declared in styles.css but previously never
      // fetched, so every screen silently fell back to Georgia / system-ui.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500&family=Silkscreen:wght@400;700&display=swap",
      },
      { rel: "preload", as: "image", href: "/xp/icons32.png" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/mascot/icon-180.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Bonk",
          url: SITE_URL,
          description:
            "Shared focus timer for deep work. Run pomodoro or interval cycles solo, or host live rooms where friends sync on the same timer.",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // Applied before hydration so the picked scheme is present on first paint.
  // The scheme is the source of truth; the stock is whichever one it belongs to.
  const themeBootstrap = `try{var t=localStorage.getItem('wd.theme');if(t!=='light'&&t!=='dark')t=t==='midnight'?'dark':t?'light':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var s=localStorage.getItem('wd.scheme');if(['blue','olive','silver','midnight'].indexOf(s)<0)s=t==='dark'?'midnight':'blue';t=s==='midnight'?'dark':'light';document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-scheme',s);localStorage.setItem('wd.theme',t);localStorage.setItem('wd.scheme',s);if(t==='light')localStorage.setItem('wd.lightScheme',s);var lg=localStorage.getItem('wd.lang');if(['en','es','fr','de','ja'].indexOf(lg)<0)lg='en';document.documentElement.setAttribute('lang',lg);localStorage.setItem('wd.lang',lg);var a=localStorage.getItem('wd.activeCustomTheme');var raw=localStorage.getItem('wd.customThemes');if(a&&raw){var arr=JSON.parse(raw);var m=arr.find(function(x){return x.id===a});if(m){var el=document.documentElement;el.dataset.ctActive='true';if(m.gifUrl){el.dataset.ctHasBg='true';var u=String(m.gifUrl).replace(/\\\\/g,'\\\\\\\\').replace(/"/g,'\\\\"');el.style.setProperty('--ct-gif','url("'+u+'")');}if(m.overlayTint)el.style.setProperty('--ct-overlay-tint',m.overlayTint);el.style.setProperty('--ct-overlay-opacity',String((m.overlayOpacity==null?30:m.overlayOpacity)/100));el.style.setProperty('--ct-glass-blur',(m.glassBlur||0)+'px');el.style.setProperty('--ct-panel-radius',(m.panelRoundness==null?12:m.panelRoundness)+'px');}}}catch(e){}`;
  return (
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <HeadContent />
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useLockdown();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <WindowProvider>
        <CustomThemeMount />
        <WallpaperMount />
        <div className="ct-bg-layer" aria-hidden />
        <div className="ct-tint-layer" aria-hidden />
        <Outlet />
        <Desktop />
        <PinnedRail />
        <Toaster closeButton />
        <MascotHost />
        <UpdateBar />
        <BootScreen />
      </WindowProvider>
    </QueryClientProvider>
  );
}
