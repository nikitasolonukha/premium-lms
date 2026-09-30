begin;
-- Operational delegation is explicit: interactive calls require the existing
-- live Admin/AAL2 gate. Background work accepts only server credentials and
-- rechecks the owner's current role, confirmation, MFA and disabled state.
create table private.operations_jobs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('import','report','video')), payload jsonb not null,
 status text not null default 'preview' check(status in ('preview','queued','running','succeeded','failed','cancelled')),
 attempts integer not null default 0, progress integer not null default 0 check(progress between 0 and 100),
 result jsonb not null default '{}', error_code text, dedupe_key text unique,
 available_at timestamptz not null default now(), lease uuid, heartbeat_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index operations_jobs_queue on private.operations_jobs(available_at,created_at) where status='queued';
create index operations_jobs_owner on private.operations_jobs(owner_id,created_at desc);
create table private.telegram_links (
 owner_id uuid primary key references public.profiles(id), token_hash text not null unique,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table private.telegram_connections (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references public.profiles(id),
 telegram_id bigint not null unique, chat_id bigint not null unique, enabled boolean not null default true,
 created_at timestamptz not null default now()
);
create table private.telegram_updates(update_id bigint primary key, received_at timestamptz not null default now());
create table private.automation_rules (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 name text not null check(length(name) between 1 and 100), kind text not null check(kind in ('summary','inactive','completions')),
 enabled boolean not null default false, frequency text not null check(frequency in ('daily','weekly')),
 hour integer not null check(hour between 0 and 23), minute integer not null check(minute between 0 and 59),
 weekday integer not null check(weekday between 0 and 6), timezone text not null,
 recipients uuid[] not null check(cardinality(recipients) between 1 and 20),
 next_run_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table private.bulk_requests(id uuid primary key, owner_id uuid not null, fingerprint text not null, result jsonb not null);
create table private.worker_status(id boolean primary key default true check(id), heartbeat_at timestamptz not null, capabilities jsonb not null);
alter table private.operations_jobs enable row level security;
alter table private.telegram_links enable row level security;
alter table private.telegram_connections enable row level security;
alter table private.telegram_updates enable row level security;
alter table private.automation_rules enable row level security;
alter table private.bulk_requests enable row level security;
alter table private.worker_status enable row level security;
revoke all on all tables in schema private from anon,authenticated,service_role;

alter table public.media drop constraint media_size_bytes_check;
alter table public.media add constraint media_size_bytes_check check(size_bytes between 1 and case when mime_type='video/mp4' then 2147483648 else 52428800 end);
alter table public.media add column video_download_allowed boolean not null default false;
alter table public.media add column duration_seconds integer;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('academy-video-source','academy-video-source',false,1073741824,array['video/mp4']) on conflict(id) do nothing;
update storage.buckets set file_size_limit=2147483648,allowed_mime_types=case when allowed_mime_types is null then null else array_append(allowed_mime_types,'video/mp4') end where id='academy-private';

create function private.active_operator(uid uuid, staff boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id join auth.users u on u.id=p.id
 where p.id=uid and p.disabled_at is null and u.email_confirmed_at is not null and (r.role='admin' or (staff and r.role='editor'))
 and exists(select 1 from auth.mfa_factors f where f.user_id=uid and f.status='verified' and f.factor_type='totp'))
$$;

create function private.next_automation_time(freq text, h integer, m integer, wd integer, tz text, after_time timestamptz) returns timestamptz language plpgsql stable set search_path='' as $$
declare local_time timestamp; candidate timestamp;
begin
 if freq not in ('daily','weekly') or h not between 0 and 23 or m not between 0 and 59 or wd not between 0 and 6
 or not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'INVALID_SCHEDULE'; end if;
 local_time:=after_time at time zone tz;
 candidate:=date_trunc('day',local_time)+make_interval(hours=>h,mins=>m);
 if freq='weekly' then candidate:=candidate+make_interval(days=>(wd-extract(dow from candidate)::int+7)%7); end if;
 if candidate at time zone tz<=after_time then candidate:=candidate+make_interval(days=>case when freq='weekly' then 7 else 1 end); end if;
 return candidate at time zone tz;
end $$;

create function private.operations_grant(actor uuid,target uuid,cid uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare eid uuid; changed boolean;
begin
 if not private.active_operator(actor) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id where p.id=target and p.disabled_at is null and r.role='student')
 or not exists(select 1 from public.courses where id=cid and deleted_at is null) then raise exception 'INVALID_ASSIGNMENT'; end if;
 insert into public.enrollments(user_id,course_id) values(target,cid) on conflict(user_id,course_id) do update set user_id=excluded.user_id returning id into eid;
 insert into public.access_grants(enrollment_id,source,granted_by,revoked_at) values(eid,'manual',actor,case when enabled then null else now() end)
 on conflict(enrollment_id,source) do update set revoked_at=excluded.revoked_at,granted_by=excluded.granted_by,expires_at=null
 where (public.access_grants.revoked_at is null) is distinct from enabled or public.access_grants.expires_at is not null;
 changed:=found;
 if changed then insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(actor,case when enabled then 'access.grant' else 'access.revoke' end,'course',cid::text,jsonb_build_object('user_id',target,'source','operations')); end if;
end $$;

create function private.student_card(target uuid, page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_staff(true);
 if page not between 1 and 10000 then raise exception 'INVALID_PAGE'; end if;
 select jsonb_build_object('profile',jsonb_build_object('id',p.id,'first_name',p.first_name,'last_name',p.last_name,'email',u.email,'role',r.role,'disabled_at',p.disabled_at,'created_at',p.created_at,'last_sign_in_at',u.last_sign_in_at),'courses',
 coalesce((select jsonb_agg(row_to_json(x)) from (
 select c.id,c.slug,coalesce(cr.title,dr.title) title,cr.access_mode,
 exists(select 1 from public.access_grants g where g.enrollment_id=e.id and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())) or cr.access_mode='registered' access,
 (select count(*) from public.lesson_revisions l where l.revision_id=c.published_revision_id and l.published) lessons,
 (select count(*) from public.progress pr join public.lesson_revisions l on l.lesson_id=pr.lesson_id and l.revision_id=c.published_revision_id and l.published where pr.user_id=target and pr.completed_at is not null) completed,
 (select max(last_opened_at) from public.progress where user_id=target and course_id=c.id) last_activity,
 (select jsonb_build_object('title',coalesce(lr.title,'Урок вне текущей программы'),'id',pr.lesson_id,'opened_at',pr.last_opened_at,'completed_at',pr.completed_at) from public.progress pr left join public.lesson_revisions lr on lr.lesson_id=pr.lesson_id and lr.revision_id=c.published_revision_id where pr.user_id=target and pr.course_id=c.id order by pr.last_opened_at desc limit 1) last_lesson,
 coalesce((select jsonb_agg(jsonb_build_object('source',g.source,'created_at',g.created_at,'expires_at',g.expires_at,'revoked_at',g.revoked_at)) from public.access_grants g where g.enrollment_id=e.id),'[]') grants
 from public.courses c left join public.course_revisions cr on cr.id=c.published_revision_id left join public.course_revisions dr on dr.id=c.draft_revision_id
 left join public.enrollments e on e.course_id=c.id and e.user_id=target
 where c.deleted_at is null and (e.id is not null or cr.access_mode='registered' or exists(select 1 from public.progress where course_id=c.id and user_id=target))
 order by c.created_at desc limit 20 offset (page-1)*20) x),'[]'),
 'total',(select count(*) from public.courses c left join public.course_revisions cr on cr.id=c.published_revision_id where c.deleted_at is null and (cr.access_mode='registered' or exists(select 1 from public.enrollments e where e.course_id=c.id and e.user_id=target) or exists(select 1 from public.progress where course_id=c.id and user_id=target))),
 'history',coalesce((select jsonb_agg(row_to_json(a)) from (select id,action,entity_type,entity_id,metadata,created_at from public.audit_logs where entity_id=target::text or metadata->>'user_id'=target::text order by created_at desc limit 50) a),'[]')) into result
 from public.profiles p join auth.users u on u.id=p.id join public.user_roles r on r.user_id=p.id where p.id=target;
 if result is null then raise exception 'NOT_FOUND'; end if;
 return result;
end $$;

create function private.operations(op text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.operations_jobs; rule private.automation_rules; target uuid; cid uuid; ids uuid[]; req uuid; fingerprint text; previous private.bulk_requests;
 rows jsonb; row jsonb; normalized jsonb='[]'; issues jsonb; existing record; n integer; result jsonb; token text; recipients uuid[]; retry integer;
begin
 if op like 'video.%' then perform private.require_staff(); else perform private.require_staff(true); end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>1000000 then raise exception 'INVALID_PAYLOAD'; end if;
 if op in ('student','list','rules','connections','video.list','worker') then
  if op='student' then return private.student_card((payload->>'id')::uuid,coalesce((payload->>'page')::integer,1)); end if;
  if op='worker' then return coalesce((select to_jsonb(w) from private.worker_status w where id=true),'{}'); end if;
  if op='rules' then return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from private.automation_rules a),'[]'); end if;
  if op='connections' then return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'owner_id',t.owner_id,'name',p.first_name||' '||p.last_name,'enabled',t.enabled,'created_at',t.created_at)) from private.telegram_connections t join public.profiles p on p.id=t.owner_id where private.active_operator(t.owner_id)),'[]'); end if;
  if op='video.list' then
   return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'status',v.status,'progress',v.progress,'filename',v.payload->>'filename','title',v.payload->>'watermark','media_id',v.payload->>'media_id','poster_id',v.payload->>'poster_id','download',v.payload->'download','result',v.result,'error_code',v.error_code,'created_at',v.created_at)) from (select * from private.operations_jobs v where v.kind='video' and (private.is_staff(true) or v.owner_id=auth.uid()) and (coalesce(payload->>'q','')='' or v.payload->>'filename' ilike '%'||left(payload->>'q',100)||'%') order by v.created_at desc limit 50) v),'[]');
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'status',x.status,'progress',x.progress,'attempts',x.attempts,'result',x.result,'error_code',x.error_code,'created_at',x.created_at,'updated_at',x.updated_at,'title',coalesce(x.payload->>'filename',x.payload->>'name',x.kind))) from (select * from private.operations_jobs where status<>'preview' order by created_at desc limit 100) x),'[]');
 end if;
 retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if op='bulk' then
  req:=(payload->>'requestId')::uuid; cid:=(payload->>'courseId')::uuid;
  select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(payload->'userIds');
  if req is null or coalesce(cardinality(ids),0) not between 1 and 500 or jsonb_typeof(payload->'enabled')<>'boolean' then raise exception 'INVALID_BULK'; end if;
  fingerprint:=encode(extensions.digest(payload::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(req::text,0));
  select * into previous from private.bulk_requests where id=req;
  if found then if previous.owner_id<>auth.uid() or previous.fingerprint<>fingerprint then raise exception 'CONFLICT'; end if; return previous.result; end if;
  foreach target in array ids loop perform private.operations_grant(auth.uid(),target,cid,(payload->>'enabled')::boolean); end loop;
  result:=jsonb_build_object('count',cardinality(ids));
  insert into private.bulk_requests values(req,auth.uid(),fingerprint,result); return result;
 elsif op='import.preview' then
  rows:=payload->'rows'; if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 500 then raise exception 'INVALID_IMPORT'; end if;
  n:=0;
  for row in select value from jsonb_array_elements(rows) loop
   n:=n+1; issues:='[]';
   if length(coalesce(row->>'email',''))>254 or coalesce(row->>'email','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then issues:=issues||'"Некорректный email"'::jsonb; end if;
   if length(coalesce(row->>'first_name','')) not between 1 and 80 or length(coalesce(row->>'last_name',''))>80 then issues:=issues||'"Проверьте имя и фамилию"'::jsonb; end if;
   if exists(select 1 from jsonb_array_elements(normalized) a where a->>'email'=lower(trim(row->>'email'))) then issues:=issues||'"Повтор email в таблице"'::jsonb; end if;
   select p.id,r.role,p.disabled_at into existing from auth.users u join public.profiles p on p.id=u.id join public.user_roles r on r.user_id=u.id where lower(u.email)=lower(trim(row->>'email'));
   if found and (existing.role<>'student' or existing.disabled_at is not null) then issues:=issues||'"Аккаунт сотрудника или отключённый ученик"'::jsonb; end if;
   normalized:=normalized||jsonb_build_array(jsonb_build_object('number',n,'email',lower(trim(row->>'email')),'first_name',trim(row->>'first_name'),'last_name',trim(coalesce(row->>'last_name','')),'existing_id',existing.id,'issues',issues));
  end loop;
  insert into private.operations_jobs(owner_id,kind,payload) values(auth.uid(),'import',jsonb_build_object('rows',normalized,'filename',left(payload->>'filename',240))) returning * into j;
  return jsonb_build_object('id',j.id,'rows',normalized);
 elsif op='import.confirm' then
  select * into j from private.operations_jobs where id=(payload->>'id')::uuid and owner_id=auth.uid() and kind='import' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if j.status<>'preview' then return jsonb_build_object('id',j.id,'status',j.status); end if;
  if exists(select 1 from jsonb_array_elements(j.payload->'rows') r where jsonb_array_length(r->'issues')>0) then raise exception 'IMPORT_ERRORS'; end if;
  cid:=nullif(payload->>'courseId','')::uuid;
  if cid is not null and not exists(select 1 from public.courses where id=cid and deleted_at is null) then raise exception 'NOT_FOUND'; end if;
  update private.operations_jobs set payload=j.payload||jsonb_build_object('course_id',cid),status='queued',updated_at=now() where id=j.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'students.import','job',j.id::text,jsonb_build_object('rows',jsonb_array_length(j.payload->'rows')));
  return jsonb_build_object('id',j.id);
 elsif op='telegram.link' then
  token:=encode(extensions.gen_random_bytes(24),'hex');
  insert into private.telegram_links(owner_id,token_hash,expires_at) values(auth.uid(),encode(extensions.digest(token,'sha256'),'hex'),now()+interval '5 minutes')
  on conflict(owner_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at;
  return jsonb_build_object('token',token,'expires_at',now()+interval '5 minutes');
 elsif op='telegram.disconnect' then
  update private.telegram_connections set enabled=false where owner_id=auth.uid(); delete from private.telegram_links where owner_id=auth.uid();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'telegram.disconnect','user',auth.uid()::text); return jsonb_build_object('ok',true);
 elsif op='rule.save' then
  recipients:=array(select value::uuid from jsonb_array_elements_text(payload->'recipients'));
  if cardinality(recipients) not between 1 and 20 or exists(select 1 from unnest(recipients) id where not exists(select 1 from private.telegram_connections c where c.id=id and c.enabled and private.active_operator(c.owner_id))) then raise exception 'INVALID_RECIPIENT'; end if;
  req:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
  insert into private.automation_rules(id,owner_id,name,kind,enabled,frequency,hour,minute,weekday,timezone,recipients,next_run_at)
  values(req,auth.uid(),payload->>'name',payload->>'kind',(payload->>'enabled')::boolean,payload->>'frequency',(payload->>'hour')::int,(payload->>'minute')::int,(payload->>'weekday')::int,payload->>'timezone',recipients,
  private.next_automation_time(payload->>'frequency',(payload->>'hour')::int,(payload->>'minute')::int,(payload->>'weekday')::int,payload->>'timezone',now()))
  on conflict(id) do update set name=excluded.name,kind=excluded.kind,enabled=excluded.enabled,frequency=excluded.frequency,hour=excluded.hour,minute=excluded.minute,weekday=excluded.weekday,timezone=excluded.timezone,recipients=excluded.recipients,next_run_at=excluded.next_run_at,updated_at=now();
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'automation.save','automation',req::text); return jsonb_build_object('id',req);
 elsif op='rule.toggle' then
  update private.automation_rules set enabled=(payload->>'enabled')::boolean,updated_at=now() where id=(payload->>'id')::uuid;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'automation.toggle','automation',payload->>'id',jsonb_build_object('enabled',payload->'enabled')); return jsonb_build_object('ok',true);
 elsif op='rule.run' then
  select * into rule from private.automation_rules where id=(payload->>'id')::uuid; if not found then raise exception 'NOT_FOUND'; end if;
  insert into private.operations_jobs(owner_id,kind,status,payload) values(auth.uid(),'report','queued',jsonb_build_object('name',rule.name,'report',rule.kind,'recipients',to_jsonb(rule.recipients))) returning * into j;
  return jsonb_build_object('id',j.id);
 elsif op='job.retry' or op='video.retry' then
  update private.operations_jobs set status='queued',attempts=0,error_code=null,lease=null,available_at=now(),updated_at=now()
  where id=(payload->>'id')::uuid and status='failed' and (op='job.retry' or (kind='video' and (owner_id=auth.uid() or private.is_staff(true))));
  if not found then raise exception 'CONFLICT'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'job.retry','job',payload->>'id'); return jsonb_build_object('ok',true);
 elsif op='video.create' then
  req:=(payload->>'id')::uuid;
  if req is null or length(payload->>'filename') not between 1 and 240 or (payload->>'size')::bigint not between 1 and 1073741824 or length(payload->>'watermark') not between 1 and 120 then raise exception 'INVALID_VIDEO'; end if;
  insert into public.media(id,owner_id,object_key,filename,mime_type,size_bytes) values(req,auth.uid(),auth.uid()::text||'/'||req::text,payload->>'filename','video/mp4',(payload->>'size')::bigint);
  insert into private.operations_jobs(owner_id,kind,payload) values(auth.uid(),'video',payload||jsonb_build_object('media_id',req,'poster_id',gen_random_uuid(),'original_key',auth.uid()::text||'/'||req::text)) returning * into j;
  return jsonb_build_object('id',j.id,'media_id',req,'original_key',j.payload->>'original_key');
 elsif op='video.enqueue' then
  update private.operations_jobs set status='queued',updated_at=now() where id=(payload->>'id')::uuid and kind='video' and owner_id=auth.uid() and status='preview';
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'UNKNOWN_OPERATION';
end $$;
create function public.operations(op text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.operations(op,payload) $$;
revoke all on function private.operations(text,jsonb),public.operations(text,jsonb),private.student_card(uuid,integer),private.active_operator(uuid,boolean),private.operations_grant(uuid,uuid,uuid,boolean),private.next_automation_time(text,integer,integer,integer,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.operations(text,jsonb),public.operations(text,jsonb) to authenticated;

-- Background reports contain no content, playback grants or credential fields.
create function private.owner_report(kind text,cid uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if kind='summary' then return jsonb_build_object('new',(select count(*) from public.profiles where created_at>now()-interval '24 hours'),'active',(select count(distinct user_id) from public.progress where last_opened_at>now()-interval '24 hours'),'lessons',(select count(*) from public.progress where completed_at>now()-interval '24 hours'),'courses',(select count(*) from public.courses where deleted_at is null and published_revision_id is not null)); end if;
 if kind='inactive' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select p.first_name,p.last_name,u.email,max(pr.last_opened_at) last_activity from public.profiles p join public.user_roles r on r.user_id=p.id join auth.users u on u.id=p.id left join public.progress pr on pr.user_id=p.id where r.role='student' and p.disabled_at is null and exists(select 1 from public.enrollments e join public.access_grants g on g.enrollment_id=e.id where e.user_id=p.id and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())) group by p.id,u.email having coalesce(max(pr.last_opened_at),p.created_at)<now()-interval '7 days' order by max(pr.last_opened_at) nulls first limit 500) x),'[]'); end if;
 if kind='completions' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select p.first_name,p.last_name,u.email,cr.title course,max(pr.completed_at) completed_at from public.profiles p join auth.users u on u.id=p.id join public.progress pr on pr.user_id=p.id join public.courses c on c.id=pr.course_id and c.deleted_at is null join public.course_revisions cr on cr.id=c.published_revision_id join public.lesson_revisions lr on lr.revision_id=c.published_revision_id and lr.lesson_id=pr.lesson_id and lr.published where pr.completed_at is not null group by p.id,u.email,c.id,cr.title having count(*)=(select count(*) from public.lesson_revisions where revision_id=c.published_revision_id and published) and max(pr.completed_at)>now()-interval '7 days' order by max(pr.completed_at) desc limit 500) x),'[]'); end if;
 if kind='courses' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select c.id,r.title from public.courses c join public.course_revisions r on r.id=c.published_revision_id where c.deleted_at is null order by r.title limit 50) x),'[]'); end if;
 if kind='students' then return coalesce((select jsonb_agg(to_jsonb(x)) from (select p.first_name,p.last_name,u.email,r.title course,
 (select count(*) from public.lesson_revisions where revision_id=c.published_revision_id and published) lessons,
 count(pr.lesson_id) filter(where pr.completed_at is not null and lr.lesson_id is not null) completed,max(pr.last_opened_at) last_activity
 from public.enrollments e join public.profiles p on p.id=e.user_id join public.user_roles ur on ur.user_id=p.id and ur.role='student' join auth.users u on u.id=p.id join public.courses c on c.id=e.course_id and c.deleted_at is null join public.course_revisions r on r.id=c.published_revision_id left join public.progress pr on pr.user_id=p.id and pr.course_id=c.id left join public.lesson_revisions lr on lr.revision_id=c.published_revision_id and lr.lesson_id=pr.lesson_id and lr.published where cid is null or c.id=cid group by p.id,u.email,c.id,r.title order by p.last_name,p.first_name limit 5000) x),'[]'); end if;
 raise exception 'INVALID_REPORT';
end $$;

create function private.worker_api(op text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.operations_jobs; rule private.automation_rules; connection private.telegram_connections; link private.telegram_links; target uuid; row jsonb; n int; cid uuid; result jsonb; recipient uuid;
begin
 if octet_length(payload::text)>1000000 then raise exception 'INVALID_PAYLOAD'; end if;
 if op='heartbeat' then
  insert into private.worker_status values(true,now(),payload) on conflict(id) do update set heartbeat_at=now(),capabilities=excluded.capabilities;
  return jsonb_build_object('ok',true);
 elsif op='schedule' then
  for rule in select * from private.automation_rules where enabled and next_run_at<=now() order by next_run_at for update skip locked limit 50 loop
   if private.active_operator(rule.owner_id) then
    insert into private.operations_jobs(owner_id,kind,status,payload,dedupe_key) values(rule.owner_id,'report','queued',jsonb_build_object('name',rule.name,'report',rule.kind,'recipients',to_jsonb(rule.recipients)),'rule:'||rule.id::text||':'||rule.next_run_at::text) on conflict(dedupe_key) do nothing;
   end if;
   update private.automation_rules set next_run_at=private.next_automation_time(rule.frequency,rule.hour,rule.minute,rule.weekday,rule.timezone,now()) where id=rule.id;
  end loop;
  return jsonb_build_object('ok',true);
 elsif op='telegram' then
  if (payload->>'chat_id')::bigint<>(payload->>'telegram_id')::bigint or payload->>'chat_type'<>'private' then return jsonb_build_object('ignored',true); end if;
  insert into private.telegram_updates(update_id) values((payload->>'update_id')::bigint) on conflict do nothing;
  if not found then return jsonb_build_object('duplicate',true); end if;
  if payload->>'command'='link' then
   delete from private.telegram_links where token_hash=encode(extensions.digest(payload->>'token','sha256'),'hex') and expires_at>now() returning * into link;
   if link.owner_id is null or not private.active_operator(link.owner_id) then return jsonb_build_object('ignored',true); end if;
   insert into private.telegram_connections(owner_id,telegram_id,chat_id) values(link.owner_id,(payload->>'telegram_id')::bigint,(payload->>'chat_id')::bigint)
   on conflict(owner_id) do update set telegram_id=excluded.telegram_id,chat_id=excluded.chat_id,enabled=true returning * into connection;
   insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(link.owner_id,'telegram.connect','user',link.owner_id::text);
  else
   select * into connection from private.telegram_connections where telegram_id=(payload->>'telegram_id')::bigint and chat_id=(payload->>'chat_id')::bigint and enabled;
   if not found or not private.active_operator(connection.owner_id) then return jsonb_build_object('ignored',true); end if;
  end if;
  if payload->>'command' not in ('link','summary','inactive','completions','students','courses','help') then return jsonb_build_object('ignored',true); end if;
  if private.consume_limit('bot:'||connection.id::text,20,60)>0 then return jsonb_build_object('limited',true); end if;
  insert into private.operations_jobs(owner_id,kind,status,payload,dedupe_key) values(connection.owner_id,'report','queued',jsonb_build_object('report',case when payload->>'command'='link' then 'help' else payload->>'command' end,'course_id',nullif(payload->>'course_id','')::uuid,'recipients',jsonb_build_array(connection.id)),'telegram:'||(payload->>'update_id')) returning * into j;
  return jsonb_build_object('id',j.id);
 elsif op='claim' then
  update private.operations_jobs set status=case when kind='report' then 'failed' else 'queued' end,error_code=case when kind='report' then 'DELIVERY_UNKNOWN' else 'WORKER_INTERRUPTED' end,lease=null
  where status='running' and heartbeat_at<now()-interval '5 minutes';
  select * into j from private.operations_jobs where status='queued' and available_at<=now() order by created_at for update skip locked limit 1;
  if not found then return 'null'::jsonb; end if;
  if not private.active_operator(j.owner_id,j.kind='video') then update private.operations_jobs set status='cancelled',error_code='OWNER_REVOKED' where id=j.id; return 'null'::jsonb; end if;
  update private.operations_jobs set status='running',attempts=attempts+1,lease=gen_random_uuid(),heartbeat_at=now(),updated_at=now() where id=j.id returning * into j;
  return to_jsonb(j);
 end if;
 select * into j from private.operations_jobs where id=(payload->>'job_id')::uuid and lease=(payload->>'lease')::uuid and status='running' for update;
 if not found then raise exception 'STALE_JOB'; end if;
 if not private.active_operator(j.owner_id,j.kind='video') then update private.operations_jobs set status='cancelled',error_code='OWNER_REVOKED' where id=j.id; return jsonb_build_object('cancelled',true); end if;
 if op='progress' then
  update private.operations_jobs set progress=greatest(progress,least(99,(payload->>'progress')::int)),heartbeat_at=now(),updated_at=now() where id=j.id; return jsonb_build_object('ok',true);
 elsif op='report' then
  result:=case when j.payload->>'report'='help' then jsonb_build_object('help',true) else private.owner_report(j.payload->>'report',nullif(j.payload->>'course_id','')::uuid) end;
  return jsonb_build_object('report',result,'recipients',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'chat_id',t.chat_id)) from private.telegram_connections t where t.id in (select value::uuid from jsonb_array_elements_text(j.payload->'recipients')) and t.enabled and private.active_operator(t.owner_id)),'[]'));
 elsif op='lookup' then
  n:=(payload->>'row')::int; row:=j.payload->'rows'->n;
  if j.kind<>'import' or row is null then raise exception 'INVALID_ROW'; end if;
  select jsonb_build_object('id',p.id,'role',r.role,'disabled',p.disabled_at is not null) into result from auth.users u join public.profiles p on p.id=u.id join public.user_roles r on r.user_id=p.id where lower(u.email)=row->>'email'; return coalesce(result,'null');
 elsif op='import.row' then
  n:=(payload->>'row')::int; row:=j.payload->'rows'->n; target:=(payload->>'user_id')::uuid;
  if j.kind<>'import' or row is null or not exists(select 1 from auth.users u join public.user_roles r on r.user_id=u.id join public.profiles p on p.id=u.id where u.id=target and lower(u.email)=row->>'email' and r.role='student' and p.disabled_at is null) then raise exception 'INVALID_ROW'; end if;
  cid:=nullif(j.payload->>'course_id','')::uuid; if cid is not null then perform private.operations_grant(j.owner_id,target,cid,true); end if;
  update private.operations_jobs set result=jsonb_set(result,array[n::text],jsonb_build_object('number',n+1,'status','done','user_id',target,'created',(payload->>'created')::boolean)),heartbeat_at=now(),progress=least(99,((n+1)*100/jsonb_array_length(j.payload->'rows'))) where id=j.id;
  return jsonb_build_object('ok',true);
 elsif op='video.commit' then
  if j.kind<>'video' or (payload->>'size')::bigint not between 1 and 2147483648 or (payload->>'duration')::int not between 1 and 14400 or length(payload->>'sha')<>64 then raise exception 'INVALID_OUTPUT'; end if;
  update public.media set status='ready',size_bytes=(payload->>'size')::bigint,sha256=payload->>'sha',width=(payload->>'width')::int,height=(payload->>'height')::int,duration_seconds=(payload->>'duration')::int,video_download_allowed=coalesce((j.payload->>'download')::boolean,false) where id=(j.payload->>'media_id')::uuid and status='pending';
  if not found then raise exception 'CONFLICT'; end if;
  insert into public.media(id,owner_id,object_key,filename,mime_type,size_bytes,status,width,height,variant_version)
  values((j.payload->>'poster_id')::uuid,j.owner_id,j.owner_id::text||'/'||(j.payload->>'poster_id'),'Обложка видео.webp','image/webp',(payload->>'poster_size')::bigint,'ready',(payload->>'width')::int,(payload->>'height')::int,1);
  update private.operations_jobs set status='succeeded',progress=100,result=jsonb_build_object('duration',payload->'duration','size',payload->'size','burned_in',true),updated_at=now(),lease=null where id=j.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(j.owner_id,'video.processed','media',j.payload->>'media_id'); return jsonb_build_object('ok',true);
 elsif op='finish' then
  if j.kind='video' and (payload->>'success')::boolean then raise exception 'USE_VIDEO_COMMIT'; end if;
  if payload->>'error' not in ('NOT_CONFIGURED','DELIVERY_UNKNOWN','DELIVERY_FAILED','IMPORT_FAILED','VIDEO_FAILED','OWNER_REVOKED','WORKER_INTERRUPTED') and not (payload->>'success')::boolean then raise exception 'INVALID_ERROR'; end if;
  update private.operations_jobs set status=case when (payload->>'success')::boolean then 'succeeded' else 'failed' end,error_code=payload->>'error',progress=case when (payload->>'success')::boolean then 100 else progress end,result=case when j.kind='import' then result else coalesce(payload->'result','{}') end,updated_at=now(),lease=null where id=j.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'UNKNOWN_WORKER_OPERATION';
end $$;
create function public.worker_api(op text,payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.worker_api(op,payload) $$;
revoke all on function private.worker_api(text,jsonb),public.worker_api(text,jsonb),private.owner_report(text,uuid) from public,anon,authenticated,service_role;
grant execute on function private.worker_api(text,jsonb),public.worker_api(text,jsonb) to service_role;
commit;
