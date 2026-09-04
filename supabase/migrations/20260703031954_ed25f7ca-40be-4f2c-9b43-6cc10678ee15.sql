
CREATE POLICY "deleted_emails_no_access" ON public.deleted_emails FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deleted_usernames_no_access" ON public.deleted_usernames FOR ALL USING (false) WITH CHECK (false);
