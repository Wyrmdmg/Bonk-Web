-- Cut the disk write traffic from the two tables that are updated in a loop.
--
-- Postgres never edits a row in place. Every UPDATE writes a whole new version
-- of the row, writes WAL for it, and leaves the old version behind as a dead
-- tuple for autovacuum to come back and reclaim. Two tables here take that
-- cost on a timer: bonk_presence.last_seen every twenty seconds per member of
-- an active room, and profiles.status on a heartbeat.
--
-- The app side of this is fixed in src/hooks/useUserStatus.ts, which no longer
-- re-writes a status that has not changed. This is the storage side.
--
-- fillfactor leaves room on each page for the new version to land beside the
-- old one. When it fits, and no indexed column changed, Postgres does a HOT
-- update: the indexes are not touched at all and the dead version is reclaimed
-- by the next ordinary page access rather than by a vacuum pass. Neither
-- last_seen nor status is indexed, so both qualify; without the free space
-- they were falling back to the full path every time.
--
-- The lower autovacuum thresholds are the other half. A table churning its
-- whole contents every twenty seconds needs vacuuming far sooner than the
-- default twenty per cent of the table, and letting the dead tuples pile up to
-- that point is what turns a steady trickle of writes into a large periodic
-- read.

ALTER TABLE public.bonk_presence SET (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.profiles SET (
  fillfactor = 90,
  autovacuum_vacuum_scale_factor = 0.05
);

-- fillfactor applies to pages written from here on. Existing pages keep the
-- density they were packed at until their dead space is released, which
-- autovacuum will now do far sooner. To have it immediately, run this once by
-- hand in the SQL editor; it cannot go in the migration because VACUUM is not
-- allowed inside a transaction block, and a migration is one transaction:
--
--   VACUUM (ANALYZE) public.bonk_presence;
--   VACUUM (ANALYZE) public.profiles;
--
-- Plain VACUUM, not FULL. FULL takes an exclusive lock and rewrites the whole
-- table, which is not worth an outage on tables this size.
