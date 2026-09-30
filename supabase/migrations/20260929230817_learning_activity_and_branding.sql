create table public.learning_activity (
 user_id uuid not null references public.profiles(id), lesson_id uuid not null references public.lessons(id),
 day date not null default current_date, first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 primary key(user_id,lesson_id,day)
);
alter table public.learning_activity enable row level security;
revoke all on public.learning_activity from anon,authenticated;
grant select on public.learning_activity to authenticated;
create policy learning_activity_read on public.learning_activity for select to authenticated using(private.live_session() and (user_id=(select auth.uid()) or private.is_staff(true)));
create index learning_activity_day on public.learning_activity(day,user_id);
create function private.track_learning() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.learning_activity(user_id,lesson_id,day,first_seen_at,last_seen_at) values(new.user_id,new.lesson_id,current_date,now(),now())
 on conflict(user_id,lesson_id,day) do update set last_seen_at=now();
 return new;
end $$;
create trigger progress_activity after insert or update on public.progress for each row execute function private.track_learning();
insert into public.learning_activity(user_id,lesson_id,day,first_seen_at,last_seen_at)
 select user_id,lesson_id,last_opened_at::date,first_opened_at,last_opened_at from public.progress on conflict do nothing;

create function public.student_summary() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('courses',(select count(*) from public.courses where deleted_at is null and private.has_course(id)),
 'completedLessons',(select count(*) from public.progress p join public.courses c on c.id=p.course_id
 join public.lesson_revisions l on l.revision_id=c.published_revision_id and l.lesson_id=p.lesson_id and l.published
 where p.user_id=auth.uid() and p.completed_at is not null and private.has_course(c.id)))
$$;
grant execute on function public.student_summary() to authenticated;

create function private.branding_media(kind text) returns text language sql stable security definer set search_path='' as $$
 select m.object_key from public.media m join public.settings s on m.id::text=s.config->>(case kind when 'logo' then 'logo_asset_id' when 'favicon' then 'favicon_asset_id' else '' end)
 where m.status='ready' and m.purpose='branding' and m.mime_type like 'image/%'
$$;
create function public.branding_media(kind text) returns text language sql security invoker set search_path='' as $$ select private.branding_media(kind) $$;
grant execute on function private.branding_media(text),public.branding_media(text) to service_role;

create or replace function private.lesson_available(lid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lessons l join public.courses c on c.id=l.course_id join public.course_revisions r on r.id=c.published_revision_id
 join public.lesson_revisions lr on lr.revision_id=r.id and lr.lesson_id=l.id join public.module_revisions mr on mr.revision_id=r.id and mr.module_id=lr.module_id
 where l.id=lid and lr.published and private.has_course(c.id) and (not r.sequential
 or exists(select 1 from public.progress own where own.user_id=auth.uid() and own.lesson_id=lid and own.completed_at is not null)
 or not exists(select 1 from public.lesson_revisions earlier join public.module_revisions em on em.revision_id=earlier.revision_id and em.module_id=earlier.module_id
 where earlier.revision_id=r.id and earlier.published and (em.position,earlier.position)<(mr.position,lr.position)
 and not exists(select 1 from public.progress p where p.user_id=auth.uid() and p.lesson_id=earlier.lesson_id and p.completed_at is not null))))
$$;

create or replace function private.analytics() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_staff(true);
 with course_stats as (
 select c.id,r.title,
 (select count(*)::int from public.lesson_revisions l where l.revision_id=r.id and l.published) as lessons,
 (select count(distinct e.user_id)::int from public.enrollments e join public.access_grants g on g.enrollment_id=e.id where e.course_id=c.id and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())) as enrollments,
 (select count(distinct p.user_id)::int from public.progress p where p.course_id=c.id) as started,
 (select count(*)::int from public.progress p join public.lesson_revisions l on l.lesson_id=p.lesson_id and l.revision_id=r.id and l.published where p.completed_at is not null) as completed_lessons,
 (select count(*)::int from (select p.user_id from public.progress p join public.lesson_revisions l on l.lesson_id=p.lesson_id and l.revision_id=r.id and l.published where p.completed_at is not null group by p.user_id having count(*)=(select count(*) from public.lesson_revisions lr where lr.revision_id=r.id and lr.published)) done) as completions
 from public.courses c join public.course_revisions r on r.id=c.published_revision_id where c.deleted_at is null),
 activity as (select d::date as day,count(distinct p.user_id)::int as active from generate_series(current_date-29,current_date,interval '1 day') d left join public.learning_activity p on p.day=d::date group by d order by d)
 select jsonb_build_object('users',(select count(*) from public.profiles where disabled_at is null),
 'active30',(select count(distinct user_id) from public.learning_activity where day>=current_date-29),
 'courses',coalesce((select jsonb_agg(to_jsonb(course_stats)) from course_stats),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(activity)) from activity),'[]'::jsonb),
 'recent',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.last_opened_at,p.completed_at,pr.first_name,pr.last_name,r.title as course,l.title as lesson from public.progress p join public.profiles pr on pr.id=p.user_id join public.courses c on c.id=p.course_id join public.course_revisions r on r.id=c.published_revision_id join public.lesson_revisions l on l.revision_id=r.id and l.lesson_id=p.lesson_id where c.deleted_at is null order by p.last_opened_at desc limit 10)x),'[]'::jsonb)) into result;
 return result;
end $$;
