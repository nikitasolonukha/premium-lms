-- Evaluate the session/role and accessible revision set once per statement,
-- rather than once per lesson in every catalog aggregate. RLS remains enabled.
create function private.readable_revisions() returns uuid[]
language plpgsql stable security definer set search_path='' as $$
begin
 if private.is_staff() then
  return coalesce((select array_agg(id) from public.course_revisions),'{}'::uuid[]);
 end if;
 if not private.live_session() then return '{}'::uuid[];end if;
 return coalesce((select array_agg(c.published_revision_id) from public.courses c
  where c.deleted_at is null and c.published_revision_id is not null and private.has_course(c.id)),'{}'::uuid[]);
end $$;
revoke all on function private.readable_revisions() from public,anon;
grant execute on function private.readable_revisions() to authenticated;
drop policy revisions_read on public.course_revisions;
create policy revisions_read on public.course_revisions for select to authenticated using(id in (select unnest(private.readable_revisions())));
drop policy revision_tags_read on public.revision_tags;
create policy revision_tags_read on public.revision_tags for select to authenticated using(revision_id in (select unnest(private.readable_revisions())));
drop policy module_revision_read on public.module_revisions;
create policy module_revision_read on public.module_revisions for select to authenticated using(revision_id in (select unnest(private.readable_revisions())));
drop policy lesson_revision_read on public.lesson_revisions;
create policy lesson_revision_read on public.lesson_revisions for select to authenticated using((select private.is_staff()) or (published and revision_id in (select unnest(private.readable_revisions()))));
drop policy progress_read on public.progress;
create policy progress_read on public.progress for select to authenticated using((select private.live_session()) and (user_id=(select auth.uid()) or (select private.is_staff(true))));
