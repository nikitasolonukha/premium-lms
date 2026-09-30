-- Measured on 300 course/file fixtures: catalog performs 346 staff_identity
-- calls per page and library 1220. Cache only row-independent STABLE checks
-- as statement InitPlans. Row-dependent course/revision/lesson/media checks
-- remain intact; there are no new grants, indexes or SECURITY DEFINER RPCs.
alter policy courses_read on public.courses using (
 deleted_at is null and ((select private.is_staff()) or private.has_course(id))
);

alter policy media_read on public.media using (
 ((select private.is_staff()) and status <> 'deleted')
 or private.can_media(id)
 or ((select private.live_session()) and owner_id=(select auth.uid()) and purpose='avatar')
);

alter policy blocks_read on public.lesson_blocks using (
 (select private.is_staff())
 or (private.can_revision(revision_id) and private.lesson_available(lesson_id))
);

alter policy block_assets_read on public.block_assets using (
 (select private.is_staff())
 or (private.can_revision(revision_id) and private.can_media(media_id))
);
