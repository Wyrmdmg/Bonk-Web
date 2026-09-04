# Deployment

The build is powered by [Nitro](https://nitro.build), which looks at the
environment it is running in at build time and produces output for that
platform automatically. You do not need to pick a preset by hand. The same
`bun run build` command works whether you deploy to Vercel, Cloudflare, or a
plain Node server; Nitro detects which one it is running under and adjusts
its output.

Whichever platform you choose, set the environment variables described in
[SELF_HOSTING.md](SELF_HOSTING.md) in that platform's dashboard before your
first deploy. A missing variable causes the app to throw a clear error
naming which one is missing, rather than failing silently.

## Vercel

1. Import the repository into Vercel.
2. Vercel detects the project as a Vite app; leave the build command as
   `bun run build` (or `vite build` if you are not using Bun on the build
   machine) and the output directory as the default Nitro picks.
3. Add each environment variable from `.env.example` under Project Settings,
   Environment Variables. Set them for both Production and Preview if you
   want preview deployments to work.
4. Deploy. Nitro detects the Vercel build environment and produces a Vercel
   compatible output automatically.

## Cloudflare

1. Create a new Pages or Workers project (Nitro supports both through
   Cloudflare's Vite integration) and connect the repository.
2. Set the build command to `bun run build`.
3. Add each environment variable from `.env.example` under the project's
   environment variable settings.
4. Deploy. Nitro detects the Cloudflare build environment and produces a
   Cloudflare compatible output automatically.

## Plain Node server

1. On your server, clone the repository and run `bun install` and
   `bun run build`, or build elsewhere and copy the resulting `.output/`
   directory over.
2. Set the environment variables from `.env.example` in the shell or process
   manager that runs the server, since a plain Node deployment reads them at
   request time rather than baking them into a platform dashboard.
3. Run the built server with Node:

   ```
   node .output/server/index.mjs
   ```

4. Put a reverse proxy such as nginx or Caddy in front of it for TLS, and
   run it under a process manager such as systemd or pm2 so it restarts if
   it crashes.

## Keeping a free tier Supabase project awake

Supabase's free plan pauses a project after 7 days with no API traffic.
`.github/workflows/keep-warm.yml` pings your project every 3 hours to
prevent that, and fails loudly if the project stops responding, which is a
useful early warning even if you are not on the free plan.

To enable it:

1. In your GitHub repository, go to Settings, Secrets and variables,
   Actions, Variables.
2. Add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as repository
   variables, using the same values as in your `.env` file. These are not
   secrets; the publishable key is the same one already shipped in the
   browser bundle. Repository variables, rather than secrets, are used here
   so the workflow's logs stay readable.
3. The workflow runs automatically from then on. You can also trigger it by
   hand from the Actions tab, using workflow_dispatch.

If you are on a paid Supabase plan, this workflow is unnecessary; you can
delete `.github/workflows/keep-warm.yml` or leave it disabled.

GitHub disables scheduled workflows on a repository after 60 days with no
commits at all, so a repository that sees no other activity may still need
an occasional commit to keep the schedule alive.
