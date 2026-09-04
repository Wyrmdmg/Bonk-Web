# Bonk

Bonk is a shared focus timer for deep work. Run solo pomodoro, interval, or
stopwatch sessions, or host a live room where friends sync on the same timer,
earn XP and coins, and climb a shared leaderboard. The whole app is styled
like a retro desktop, with draggable windows, a taskbar, and small built in
programs such as Notepad, Minesweeper, and Snake.

This repository is the self hostable version of the site. It is the same
code the live app runs, minus the companion sprite artwork, which was
licensed art and cannot be redistributed. Everything else, the timer, the
live rooms, the shop, the leaderboard, accounts, is included and works out of
the box against your own Supabase project.

## Features

- Solo focus timer: pomodoro, interval, and stopwatch modes, no account
  required.
- Live bonks: shared focus rooms with realtime presence, a host, and a
  synced countdown.
- XP, coins, and a leaderboard ranked by total XP, current streak, and
  longest streak.
- A shop for spending coins on cosmetic badges and pantry items.
- Username only accounts with a recovery code instead of email based
  password resets.
- A companion screen, raised by focusing. Ships without artwork; see
  [docs/companions.md](docs/companions.md) to add your own.
- A small set of desktop programs: Notepad, Minesweeper, Snake, Display
  Properties for themes, and a calendar.
- Five languages: English, French, German, Spanish, and Japanese.
- Built in image moderation for uploaded avatars, using a local model with
  an optional cloud fallback.

## Tech stack

- [TanStack Start](https://tanstack.com/start) and TanStack Router, on Vite
- React 19 and Tailwind CSS 4
- [Supabase](https://supabase.com) for the database, auth, storage, and
  realtime presence
- [Nitro](https://nitro.build) for the server build, which targets Node,
  Vercel, or Cloudflare depending on where you deploy
- Bun as the package manager and test runner

## Quick start

You need a Supabase project before the app will run. Follow
[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) first, then come back here.

```
git clone https://github.com/Wyrmdmg/Bonk-Web.git
cd Bonk-Web
bun install
cp .env.example .env
```

Fill in `.env` with the values from your Supabase project, then:

```
bun run dev
```

The app runs at `http://localhost:8080`.

Full instructions, including production builds and deployment, are in
[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Documentation

- [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md): install, configure, run in
  development, build for production.
- [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md): create a Supabase
  project, run the database migrations, and set up storage and auth.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): deploy to Vercel, Cloudflare, or
  a plain Node server.
- [docs/companions.md](docs/companions.md): the companion feature, and how
  to add your own sprite artwork.

## What is not included

The 123 companion and shop sprites shown on the live site were purchased
artwork and are not included in this repository. The companion feature's
code is fully present and works; without artwork it shows an empty slot
instead of a sprite. Add your own PNGs to make it complete, following the
guide in [docs/companions.md](docs/companions.md).

## License

MIT. See [LICENSE](LICENSE).
