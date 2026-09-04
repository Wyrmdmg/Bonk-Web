# Self hosting

This guide covers installing the app, configuring it, and running it in
development and production. It assumes you already have a Supabase project;
if not, do that first with [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Prerequisites

- [Bun](https://bun.sh) 1.4 or newer. The project uses Bun to install
  packages and run tests; using npm or yarn instead can break native
  bindings that Bun's installer patches automatically.
- Node.js 20 or newer, for running the production server if you are not
  deploying to Vercel or Cloudflare.
- A Supabase project, with its URL and keys in hand.
- Git.

## Get the code

```
git clone https://github.com/Wyrmdmg/Bonk-Web.git
cd Bonk-Web
```

## Install dependencies

```
bun install
```

## Configure environment variables

Copy the example file and fill it in:

```
cp .env.example .env
```

Open `.env` and set each value. Every variable is explained inline in the
file, but in short:

- `SUPABASE_URL` and `VITE_SUPABASE_URL`: your project's URL, for example
  `https://abcdefgh.supabase.co`. Both must be set to the same value; the
  `VITE_` copy is what the browser uses, the other is what the server uses.
- `SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`: your
  project's publishable (anon) key, again set to the same value in both. This
  key is safe to expose in the browser; every table it can read or write is
  protected by row level security.
- `SUPABASE_SERVICE_ROLE_KEY`: your project's service role key. This key
  bypasses row level security completely. Keep it out of version control,
  and never give it a `VITE_` prefix, since anything with that prefix is
  compiled into the public browser bundle.
- `VITE_SITE_URL`: the domain you deploy to, for example
  `https://bonk.example.com`. Used for canonical links, the sitemap, and
  social preview cards. In local development you can leave this blank.
- `ADMIN_USERNAMES`: optional, a comma separated list of usernames that get
  moderator powers in live rooms. Leave blank if you do not need this.
- `AZURE_CONTENT_SAFETY_ENDPOINT` and `AZURE_CONTENT_SAFETY_KEY`: optional.
  Uploaded avatars are checked for explicit content before they are stored.
  Without these two set, the app uses a local model that ships with the
  project's dependencies, which is slower but needs no external account.

Find the Supabase values under Project Settings, API, in your Supabase
dashboard.

## Run in development

```
bun run dev
```

This starts the app at `http://localhost:8080` with hot reload.

## Run the checks

Before committing changes or deploying, run:

```
bun run lint
bun test src
bun run check:i18n
```

`lint` runs ESLint and Prettier together. `test` runs the unit tests.
`check:i18n` checks that no user facing text was written as a plain string
instead of going through the translation system.

## Build for production

```
bun run build
```

This produces a server build under `.output/`. Nitro picks the deployment
target automatically based on the environment it detects at build time; see
[DEPLOYMENT.md](DEPLOYMENT.md) for how that applies to Vercel, Cloudflare,
and plain Node hosting.

To run the production build locally and check it before deploying:

```
bun run preview
```

## Project layout

- `src/routes/`: one file per page, using TanStack Start's file based
  routing. See `src/routes/README.md` for the naming conventions.
- `src/lib/`: shared logic, including the Supabase clients
  (`src/lib/supabase/`), server functions (files ending in `.functions.ts`),
  and the companion catalogue (`src/lib/companions.ts`).
- `src/components/`: shared React components.
- `src/lib/i18n/`: translations, one file per language.
- `supabase/migrations/`: the database schema, as a sequence of SQL files
  applied in order.
- `public/`: static assets served as is, including the pixel icon set and
  desktop wallpapers. Does not include companion sprites; see
  [companions.md](companions.md).

## Common problems

**The app throws about a missing Supabase environment variable.** Check that
`.env` exists (not just `.env.example`) and that both the plain and `VITE_`
prefixed copies of the URL and publishable key are set.

**Signing up fails silently, or `ADMIN_USERNAMES` does nothing.** These
depend on the database migrations having been run and, for a moderator
account, the username being lowercase in `ADMIN_USERNAMES` (the comparison
is case insensitive on the app's side, but the list itself should still be
plain lowercase usernames separated by commas, no spaces required).

**A live room does not sync between two browser tabs.** This uses Supabase
Realtime, which needs to be enabled for the tables it watches. This is
already configured by the migrations; if it still does not work, check that
your Supabase project has not paused itself after a period of inactivity on
the free plan. See the note about `keep-warm` in
[DEPLOYMENT.md](DEPLOYMENT.md).
