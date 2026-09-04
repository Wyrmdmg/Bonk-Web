# Supabase setup

Bonk stores everything in Supabase: the Postgres database, authentication,
file storage for avatars, and realtime presence for live rooms. This guide
walks through creating a project and getting it into a state the app can run
against.

## 1. Create a project

Go to [supabase.com](https://supabase.com), create an account if you do not
have one, and create a new project. Pick a region close to where most of
your users will be. Note the database password you set; you will not need it
for the app itself, but you will want it if you ever connect a SQL client
directly.

## 2. Get your API keys

In the project dashboard, go to Project Settings, then API. You need three
values:

- The project URL
- The publishable (anon) key
- The service role key

Put these into your `.env` file as described in
[SELF_HOSTING.md](SELF_HOSTING.md). Treat the service role key like a
password: it bypasses every access rule in the database.

## 3. Run the database migrations

The schema lives in `supabase/migrations/` as a sequence of SQL files, named
by timestamp so they apply in order. You have two ways to run them.

### Option A: Supabase CLI

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from
the project root:

```
supabase login
supabase link --project-ref your-project-ref
supabase db push
```

Your project ref is the short id in your project's URL, for example the
`abcdefgh` in `https://abcdefgh.supabase.co`. You can also update
`supabase/config.toml` with it to avoid retyping it.

### Option B: SQL editor, by hand

If you would rather not install the CLI, open the SQL editor in your
Supabase dashboard and run each file in `supabase/migrations/` in filename
order, oldest first. There are 43 files; paste each one in, run it, and move
to the next. This is slower but needs nothing installed locally.

## 4. Confirm pg_cron is running

One migration schedules a job called `auto-end-stale-bonks`, which closes
live rooms that have had no active member for 15 minutes. It enables the
`pg_cron` extension itself as part of running, so nothing extra should be
needed. If the migration that creates it fails, enable `pg_cron` manually
first under Database, Extensions, in the dashboard, then rerun that one
migration.

You can confirm the job is scheduled by running this in the SQL editor:

```
select jobname, schedule from cron.job;
```

You should see `auto-end-stale-bonks` scheduled for every 5 minutes.

## 5. Storage

Avatar uploads go into a bucket called `avatars`. One of the migrations
creates this bucket for you, along with a size limit and allowed file types.
Nothing further to configure here; if you ever see an error mentioning that
bucket being missing, it means that specific migration was skipped.

## 6. Authentication

Bonk uses usernames, not email addresses, as the visible identity, and a
recovery code instead of an emailed password reset link. Accounts are
created through the service role key from the app's own signup flow, not
through Supabase's hosted signup UI, so there is nothing to configure under
Authentication, Providers.

There is one email Supabase does send on your behalf: the password reset
email, when a user asks to reset their password using their recovery code
flow. To make that email match the rest of the app instead of Supabase's
default template:

1. In the dashboard, go to Authentication, Emails, Reset Password.
2. Open `supabase/templates/reset-password.html` in this repository.
3. Replace `your-domain.example` in that file with the domain you are
   deploying to.
4. Paste the file's contents into the template editor and save.

This step is cosmetic. Password resets work with the default Supabase
template too; this just makes the email look like the rest of the site.

## 7. Set ADMIN_USERNAMES

If you want moderator powers in live rooms for your own account or a few
others, set `ADMIN_USERNAMES` in `.env` to a comma separated list of
usernames, lowercase, no spaces required around the commas. Leave it blank
if you do not need this. This takes effect immediately, no migration or
Supabase dashboard change required, since it is read from your app's own
environment at request time.

## 8. Free plan pausing

Supabase's free plan pauses a project after 7 days with no API traffic, and
waking it back up takes a few minutes. If you are on the free plan and want
the app to stay warm, see the `keep-warm` GitHub Actions workflow described
in [DEPLOYMENT.md](DEPLOYMENT.md).

## You are done

At this point your database is set up. Head back to
[SELF_HOSTING.md](SELF_HOSTING.md) to run the app, or to
[DEPLOYMENT.md](DEPLOYMENT.md) to put it online.
