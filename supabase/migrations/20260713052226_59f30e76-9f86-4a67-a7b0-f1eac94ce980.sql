
-- Storage policies for the private avatars bucket.
-- Convention: files live at "<user_id>/<filename>".

CREATE POLICY "avatars: authenticated can read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner can insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars: owner can update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "avatars: owner can delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
