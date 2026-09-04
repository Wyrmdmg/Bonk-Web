-- The avatars bucket itself, which no migration ever created.
--
-- Every policy below has existed since 20260713052226, but the bucket they scope
-- was made by hand in the dashboard of the original project. When the database
-- moved in August the migrations came with it and the bucket did not, so
-- storage.from("avatars").upload() answered "Bucket not found" for every user
-- and the settings page reported "Could not upload profile picture" to all of
-- them. Declaring it here means a fresh project gets it with everything else.
--
-- Private: profiles.avatar_url holds the object path and the app mints a short
-- signed URL to read it, so nothing here is world readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 3145728, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
