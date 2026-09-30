create function private.staff_session_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_staff();
 return (select jsonb_build_object('serverTime',now(),'idleExpiresAt',last_active_at+interval '30 minutes','absoluteExpiresAt',started_at+interval '12 hours')
 from private.admin_sessions where session_id=(auth.jwt()->>'session_id')::uuid and user_id=auth.uid());
end $$;
create function public.staff_session_status() returns jsonb language sql stable security invoker set search_path='' as $$ select private.staff_session_status() $$;
revoke all on function private.staff_session_status(),public.staff_session_status() from public,anon,authenticated,service_role;
grant execute on function private.staff_session_status(),public.staff_session_status() to authenticated;

create function private.analytics_page(page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_staff(true);
 if page is null or page not between 1 and 10000 then raise exception 'INVALID_QUERY';end if;
 with published as materialized (
  select c.id,c.published_revision_id,r.title from public.courses c join public.course_revisions r on r.id=c.published_revision_id where c.deleted_at is null
 ), lessons as (
  select p.id,count(l.lesson_id)::int n from published p left join public.lesson_revisions l on l.revision_id=p.published_revision_id and l.published group by p.id
 ), enrolled as (
  select e.course_id,count(distinct e.user_id)::int n from public.enrollments e join published p on p.id=e.course_id join public.access_grants g on g.enrollment_id=e.id
  where g.revoked_at is null and (g.expires_at is null or g.expires_at>now()) group by e.course_id
 ), started as (
  select g.course_id,count(distinct g.user_id)::int n from public.progress g join published p on p.id=g.course_id group by g.course_id
 ), completed_per_user as (
  select g.course_id,g.user_id,count(*)::int n from public.progress g join published p on p.id=g.course_id
  join public.lesson_revisions l on l.revision_id=p.published_revision_id and l.lesson_id=g.lesson_id and l.published where g.completed_at is not null group by g.course_id,g.user_id
 ), completed as (
  select c.course_id,sum(c.n)::int completed_lessons,count(*) filter(where l.n>0 and c.n=l.n)::int completions
  from completed_per_user c join lessons l on l.id=c.course_id group by c.course_id
 ), stats as materialized (
  select p.id,p.title,l.n lessons,coalesce(e.n,0) enrollments,coalesce(s.n,0) started,coalesce(c.completed_lessons,0) completed_lessons,coalesce(c.completions,0) completions
  from published p join lessons l on l.id=p.id left join enrolled e on e.course_id=p.id left join started s on s.course_id=p.id left join completed c on c.course_id=p.id
 ), paged as (select * from stats order by title,id limit 20 offset(page-1)*20),
 activity as (select d::date as day,count(distinct a.user_id)::int as active from generate_series(current_date-29,current_date,interval '1 day') d left join public.learning_activity a on a.day=d::date group by d order by d)
 select jsonb_build_object('users',(select count(*) from public.profiles where disabled_at is null),
  'active30',(select count(distinct user_id) from public.learning_activity where day>=current_date-29),
  'courses',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'totalCourses',(select count(*) from stats),'page',page,'pageSize',20,
  'totals',(select jsonb_build_object('enrollments',coalesce(sum(enrollments),0),'completed_lessons',coalesce(sum(completed_lessons),0),'completions',coalesce(sum(completions),0)) from stats),
  'activity',coalesce((select jsonb_agg(to_jsonb(activity)) from activity),'[]'::jsonb),
  'recent',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select g.last_opened_at,g.completed_at,pr.first_name,pr.last_name,p.title course,l.title lesson from public.progress g join public.profiles pr on pr.id=g.user_id
   join published p on p.id=g.course_id join public.lesson_revisions l on l.revision_id=p.published_revision_id and l.lesson_id=g.lesson_id
   order by g.last_opened_at desc,g.user_id,g.lesson_id limit 10)x),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.analytics_page(page integer default 1) returns jsonb language sql stable security invoker set search_path='' as $$ select private.analytics_page(page) $$;
revoke all on function private.analytics_page(integer),public.analytics_page(integer) from public,anon,authenticated,service_role;
grant execute on function private.analytics_page(integer),public.analytics_page(integer) to authenticated;
-- Preserve the old signature while closing its unbounded list response.
create or replace function private.analytics() returns jsonb language sql stable security definer set search_path='' as $$ select private.analytics_page(1) $$;

create function private.audit_index(q_action text default '',q_actor text default '',q_entity text default '',date_from text default '',date_to text default '',page integer default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;since_at timestamptz;until_at timestamptz;retry integer;
begin
 perform private.require_staff(true);
 if q_action is null or q_actor is null or q_entity is null or date_from is null or date_to is null or page is null
  or length(q_action)>100 or length(q_actor)>254 or length(q_entity)>200 or page not between 1 and 10000
  or (date_from<>'' and date_from !~ '^\d{4}-\d{2}-\d{2}$') or (date_to<>'' and date_to !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'INVALID_QUERY';end if;
 if date_from<>'' then since_at:=(date_from::date::timestamp at time zone 'Europe/Moscow');end if;
 if date_to<>'' then until_at:=((date_to::date+1)::timestamp at time zone 'Europe/Moscow');end if;
 if since_at is not null and until_at is not null and since_at>=until_at then raise exception 'INVALID_QUERY';end if;
 retry:=private.user_limit('search');if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry);end if;
 with filtered as (
  select a.*,p.first_name,p.last_name from public.audit_logs a left join public.profiles p on p.id=a.actor_id left join auth.users u on u.id=a.actor_id
  where (q_action='' or a.action=q_action)
   and (q_actor='' or strpos(lower(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')||' '||coalesce(u.email,'')||' '||coalesce(a.actor_id::text,'')),lower(q_actor))>0)
   and (q_entity='' or strpos(lower(a.entity_type||' '||coalesce(a.entity_id,'')),lower(q_entity))>0)
   and (since_at is null or a.created_at>=since_at) and (until_at is null or a.created_at<until_at)
 ),paged as(select * from filtered order by created_at desc,id desc limit 30 offset(page-1)*30)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from filtered),'page',page,'pageSize',30) into result;
 return result;
end $$;
create function public.audit_index(q_action text default '',q_actor text default '',q_entity text default '',date_from text default '',date_to text default '',page integer default 1)
returns jsonb language sql security invoker set search_path='' as $$ select private.audit_index(q_action,q_actor,q_entity,date_from,date_to,page) $$;
revoke all on function private.audit_index(text,text,text,text,text,integer),public.audit_index(text,text,text,text,text,integer) from public,anon,authenticated,service_role;
grant execute on function private.audit_index(text,text,text,text,text,integer),public.audit_index(text,text,text,text,text,integer) to authenticated;

create table private.video_config_state (
 environment text primary key check(environment in ('local','staging','production')),
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'), observed_at timestamptz not null default now()
);
alter table private.video_config_state enable row level security;
revoke all on private.video_config_state from public,anon,authenticated,service_role;
create function private.observe_video_config(environment text,fingerprint text,cloudflare boolean,mux boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed boolean;
begin
 if environment is null or environment not in ('local','staging','production') or fingerprint is null or fingerprint !~ '^[a-f0-9]{64}$' or cloudflare is null or mux is null then raise exception 'INVALID_CONFIG_OBSERVATION';end if;
 insert into private.video_config_state(environment,fingerprint) values(environment,fingerprint)
 on conflict on constraint video_config_state_pkey do update set fingerprint=excluded.fingerprint,observed_at=now() where video_config_state.fingerprint<>excluded.fingerprint;
 changed:=found;
 if changed then insert into public.audit_logs(action,entity_type,entity_id,metadata)
  values('video.provider_config','environment',environment,jsonb_build_object('environment',environment,'cloudflare_enabled',cloudflare,'mux_enabled',mux,'method','server-environment-observation'));end if;
 return changed;
end $$;
create function public.observe_video_config(environment text,fingerprint text,cloudflare boolean,mux boolean)
returns boolean language sql security invoker set search_path='' as $$ select private.observe_video_config(environment,fingerprint,cloudflare,mux) $$;
revoke all on function private.observe_video_config(text,text,boolean,boolean),public.observe_video_config(text,text,boolean,boolean) from public,anon,authenticated,service_role;
grant execute on function private.observe_video_config(text,text,boolean,boolean),public.observe_video_config(text,text,boolean,boolean) to service_role;
