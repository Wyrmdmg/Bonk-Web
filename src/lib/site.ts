// Canonical public origin, in one place. Previously this domain was written
// out as 21 string literals across 8 route files, which is how they came to
// disagree with where the site actually lives. Set VITE_SITE_URL to the
// domain you deploy to; canonical links, og:url and the sitemap all read it.
export const SITE_URL = import.meta.env.VITE_SITE_URL || "https://example.com";

/** Absolute URL for a path, for canonical links, og:url and the sitemap. */
export const siteUrl = (path = "/") => `${SITE_URL}${path}`;
