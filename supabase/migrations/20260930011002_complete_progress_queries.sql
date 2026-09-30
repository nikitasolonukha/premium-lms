-- Return one user's complete published-course progress as a single bounded-by-
-- course JSON value. A REST row limit must never change the completion denominator.
create function public.course_progress(cid uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('lesson_id',p.lesson_id,'completed_at',p.completed_at)
  order by p.last_opened_at desc),'[]'::jsonb)
 from public.progress p join public.courses c on c.id=p.course_id
 join public.lesson_revisions l on l.lesson_id=p.lesson_id and l.revision_id=c.published_revision_id and l.published
 where p.course_id=cid and p.user_id=auth.uid() and private.has_course(cid)
$$;
revoke all on function public.course_progress(uuid) from public,anon;
grant execute on function public.course_progress(uuid) to authenticated;
