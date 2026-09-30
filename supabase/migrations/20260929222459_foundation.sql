-- All Data API privileges are explicit. Mutations use narrow invoker RPCs;
-- privileged implementations are isolated in the unexposed private schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
-- EXECUTE's built-in PUBLIC default is global; a per-schema revoke cannot
-- subtract it. Keep this global revoke even when adding new private schemas.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
create extension if not exists pg_trgm with schema extensions;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null default '' check (length(first_name)<=80),
 last_name text not null default '' check (length(last_name)<=80),
 avatar_id uuid, disabled_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 role text not null default 'student' check (role in ('student','editor','admin')),
 updated_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), name text not null unique check(length(name) between 1 and 80),
 color text not null default 'blue' check(color in ('blue','lime','lilac','peach')),
 created_at timestamptz not null default now()
);
create table public.media (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id),
 object_key text not null unique, filename text not null check(length(filename) between 1 and 240),
 mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 52428800),
 status text not null default 'pending' check(status in ('pending','ready','rejected','deleted')),
 purpose text not null default 'course' check(purpose in ('course','avatar','branding')),
 sha256 text, width integer, height integer, created_at timestamptz not null default now()
);
alter table public.profiles add constraint profiles_avatar_fk foreign key(avatar_id) references public.media(id);
create table public.courses (
 id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 published_revision_id uuid, draft_revision_id uuid,
 created_by uuid not null references public.profiles(id), deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.course_revisions (
 id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id),
 version integer not null default 1 check(version>0), is_published boolean not null default false,
 slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 title text not null check(length(title) between 1 and 180), summary text not null default '' check(length(summary)<=400),
 description text not null default '' check(length(description)<=12000), author text not null default '' check(length(author)<=180),
 category_id uuid references public.categories(id), cover_id uuid references public.media(id),
 accent text not null default 'blue' check(accent in ('blue','lime','lilac','peach')),
 featured boolean not null default false, access_mode text not null default 'restricted' check(access_mode in ('restricted','registered')),
 sequential boolean not null default false,
 search_vector tsvector generated always as (to_tsvector('russian',coalesce(title,'')||' '||coalesce(summary,'')||' '||coalesce(description,'')) || to_tsvector('english',coalesce(title,'')||' '||coalesce(summary,''))) stored,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,course_id)
);
alter table public.courses add constraint courses_published_fk foreign key(published_revision_id,id) references public.course_revisions(id,course_id) deferrable initially deferred;
alter table public.courses add constraint courses_draft_fk foreign key(draft_revision_id,id) references public.course_revisions(id,course_id) deferrable initially deferred;
create table public.tags (id uuid primary key default gen_random_uuid(), name text not null unique check(length(name) between 1 and 40));
create table public.revision_tags (revision_id uuid not null references public.course_revisions(id) on delete cascade, tag_id uuid not null references public.tags(id), primary key(revision_id,tag_id));
create table public.modules (id uuid primary key, course_id uuid not null references public.courses(id), unique(id,course_id));
create table public.lessons (id uuid primary key, course_id uuid not null references public.courses(id), created_at timestamptz not null default now(), unique(id,course_id));
create table public.module_revisions (
 revision_id uuid not null, course_id uuid not null, module_id uuid not null,
 title text not null check(length(title) between 1 and 180), position integer not null check(position>=0),
 primary key(revision_id,module_id), unique(revision_id,position), unique(revision_id,module_id,course_id),
 foreign key(revision_id,course_id) references public.course_revisions(id,course_id) on delete cascade,
 foreign key(module_id,course_id) references public.modules(id,course_id)
);
create table public.lesson_revisions (
 revision_id uuid not null, course_id uuid not null, lesson_id uuid not null, module_id uuid not null,
 slug text not null check(slug ~ '^[a-z0-9][a-z0-9-]{0,99}$'), title text not null check(length(title) between 1 and 180),
 duration integer not null default 0 check(duration between 0 and 1440), published boolean not null default true,
 position integer not null check(position>=0), primary key(revision_id,lesson_id),
 unique(revision_id,slug), unique(revision_id,module_id,position),
 foreign key(revision_id,module_id,course_id) references public.module_revisions(revision_id,module_id,course_id) on delete cascade,
 foreign key(lesson_id,course_id) references public.lessons(id,course_id)
);
create table public.lesson_blocks (
 revision_id uuid not null, lesson_id uuid not null, id uuid not null, position integer not null check(position>=0),
 type text not null check(type in ('heading','rich_text','image','video','file','link','quote','callout','divider','code','gallery')),
 schema_version integer not null default 1 check(schema_version=1), data jsonb not null check(jsonb_typeof(data)='object' and octet_length(data::text)<=200000),
 primary key(revision_id,id), unique(revision_id,lesson_id,position),
 foreign key(revision_id,lesson_id) references public.lesson_revisions(revision_id,lesson_id) on delete cascade
);
create table public.block_assets (
 revision_id uuid not null, block_id uuid not null, media_id uuid not null references public.media(id),
 primary key(revision_id,block_id,media_id), foreign key(revision_id,block_id) references public.lesson_blocks(revision_id,id) on delete cascade
);
create table public.slug_aliases (
 slug text primary key, course_id uuid not null references public.courses(id), created_at timestamptz not null default now()
);
create table public.lesson_slug_aliases (
 course_id uuid not null references public.courses(id), slug text not null, lesson_id uuid not null references public.lessons(id),
 primary key(course_id,slug)
);
create table public.enrollments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), course_id uuid not null references public.courses(id),
 created_at timestamptz not null default now(), unique(user_id,course_id)
);
create table public.access_grants (
 id uuid primary key default gen_random_uuid(), enrollment_id uuid not null references public.enrollments(id),
 source text not null default 'manual' check(source in ('manual','purchase','subscription','organization')),
 granted_by uuid references public.profiles(id), expires_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now(), unique(enrollment_id,source)
);
create table public.progress (
 user_id uuid not null references public.profiles(id), lesson_id uuid not null, course_id uuid not null,
 first_opened_at timestamptz not null default now(), last_opened_at timestamptz not null default now(),
 completed_at timestamptz, playback_seconds integer not null default 0 check(playback_seconds between 0 and 86400),
 primary key(user_id,lesson_id), foreign key(lesson_id,course_id) references public.lessons(id,course_id)
);
create table public.saved_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), course_id uuid not null references public.courses(id),
 lesson_id uuid, created_at timestamptz not null default now(),
 foreign key(lesson_id,course_id) references public.lessons(id,course_id), unique nulls not distinct(user_id,course_id,lesson_id)
);
create table public.settings (id boolean primary key default true check(id), config jsonb not null default '{}', updated_at timestamptz not null default now());
insert into public.settings(id) values(true);
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id), action text not null,
 entity_type text not null, entity_id text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table private.rate_limits (key text primary key, count integer not null, window_end timestamptz not null);
create table private.admin_sessions (
 session_id uuid primary key references auth.sessions(id) on delete cascade, user_id uuid not null references public.profiles(id),
 started_at timestamptz not null, last_active_at timestamptz not null, revoked_at timestamptz
);

create index course_revisions_search on public.course_revisions using gin(search_vector);
create index course_revisions_title_trgm on public.course_revisions using gin(title extensions.gin_trgm_ops);
create index course_revisions_course on public.course_revisions(course_id);
create index course_revisions_category on public.course_revisions(category_id);
create index course_revisions_cover on public.course_revisions(cover_id);
create index profiles_avatar on public.profiles(avatar_id);
create index roles_role on public.user_roles(role);
create index modules_course on public.modules(course_id);
create index lessons_course on public.lessons(course_id);
create index lessons_revision_module on public.lesson_revisions(revision_id,module_id);
create index blocks_lesson on public.lesson_blocks(revision_id,lesson_id);
create index block_assets_media on public.block_assets(media_id);
create index grants_enrollment on public.access_grants(enrollment_id) where revoked_at is null;
create index enrollments_course on public.enrollments(course_id,user_id);
create index progress_course on public.progress(course_id,user_id);
create index progress_activity on public.progress(last_opened_at desc);
create index saved_user on public.saved_items(user_id,created_at desc);
create index audit_recent on public.audit_logs(created_at desc);
create index media_owner on public.media(owner_id,created_at desc);
create index rate_expiry on private.rate_limits(window_end);

create function private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,first_name,last_name) values(new.id,left(coalesce(new.raw_user_meta_data->>'first_name',''),80),left(coalesce(new.raw_user_meta_data->>'last_name',''),80));
 insert into public.user_roles(user_id) values(new.id);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.new_user();

create function private.live_session() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id
 where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid() and p.disabled_at is null
 and (s.not_after is null or s.not_after>now()))
$$;
create function private.staff_identity(admin_only boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.live_session() and auth.jwt()->>'aal'='aal2'
 and exists(select 1 from public.user_roles r join auth.users u on u.id=r.user_id where r.user_id=auth.uid()
 and (r.role='admin' or (not admin_only and r.role='editor')) and u.email_confirmed_at is not null)
 and exists(select 1 from auth.mfa_factors f where f.user_id=auth.uid() and f.status='verified' and f.factor_type='totp')
$$;
create function private.is_staff(admin_only boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.staff_identity(admin_only) and exists(select 1 from private.admin_sessions s where s.session_id=nullif(auth.jwt()->>'session_id','')::uuid
 and s.user_id=auth.uid() and s.revoked_at is null and s.started_at>now()-interval '12 hours' and s.last_active_at>now()-interval '30 minutes')
$$;
create function private.touch_staff_session() returns boolean language plpgsql security definer set search_path='' as $$
declare sid uuid := nullif(auth.jwt()->>'session_id','')::uuid; started timestamptz;
begin
 if not private.staff_identity() then raise exception 'MFA_REQUIRED' using errcode='42501'; end if;
 select created_at into started from auth.sessions where id=sid and user_id=auth.uid();
 if started<=now()-interval '12 hours' then raise exception 'SESSION_EXPIRED' using errcode='42501'; end if;
 insert into private.admin_sessions(session_id,user_id,started_at,last_active_at) values(sid,auth.uid(),started,now()) on conflict do nothing;
 if not private.is_staff() then raise exception 'SESSION_EXPIRED' using errcode='42501'; end if;
 update private.admin_sessions set last_active_at=now() where session_id=sid;
 if not exists(select 1 from public.audit_logs where action='admin.login' and metadata->>'session_id'=sid::text) then
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'admin.login','session',sid::text,jsonb_build_object('session_id',sid)); end if;
 return true;
end $$;
create function public.touch_staff_session() returns boolean language sql security invoker set search_path='' as $$ select private.touch_staff_session() $$;

create function private.consume_limit(k text, maximum integer, seconds integer) returns integer language plpgsql security definer set search_path='' as $$
declare result private.rate_limits;
begin
 insert into private.rate_limits(key,count,window_end) values(k,1,clock_timestamp()+make_interval(secs=>seconds))
 on conflict(key) do update set count=case when rate_limits.window_end<=clock_timestamp() then 1 else rate_limits.count+1 end,
 window_end=case when rate_limits.window_end<=clock_timestamp() then clock_timestamp()+make_interval(secs=>seconds) else rate_limits.window_end end returning * into result;
 return case when result.count>maximum then greatest(1,ceil(extract(epoch from result.window_end-clock_timestamp()))::integer) else 0 end;
end $$;
create function private.user_limit(kind text) returns integer language plpgsql security definer set search_path='' as $$
begin
 if not private.live_session() then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 if kind not in ('search','media','admin','learning') then raise exception 'INVALID_LIMIT'; end if;
 return private.consume_limit(kind||':'||auth.uid()::text,case kind when 'search' then 60 when 'media' then 30 when 'admin' then 120 else 180 end,60);
end $$;
create function public.consume_user_limit(kind text) returns integer language sql security invoker set search_path='' as $$ select private.user_limit(kind) $$;
create function private.service_limit(k text, maximum integer, seconds integer) returns integer language plpgsql security definer set search_path='' as $$
begin
 if maximum not between 1 and 1000 or seconds not between 1 and 86400 or length(k)>256 then raise exception 'INVALID_LIMIT'; end if;
 return private.consume_limit(k,maximum,seconds);
end $$;
create function public.consume_service_limit(k text, maximum integer, seconds integer) returns integer language sql security invoker set search_path='' as $$ select private.service_limit(k,maximum,seconds) $$;
create function private.require_staff(admin_only boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_staff(admin_only) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 -- A rejected operation returns normally in public RPCs where counters must persist.
end $$;
create function private.has_course(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.live_session() and exists(select 1 from public.courses c join public.course_revisions r on r.id=c.published_revision_id
 where c.id=cid and c.deleted_at is null and (r.access_mode='registered' or exists(select 1 from public.enrollments e join public.access_grants g on g.enrollment_id=e.id
 where e.course_id=cid and e.user_id=auth.uid() and g.revoked_at is null and (g.expires_at is null or g.expires_at>now()))))
$$;
create function private.can_revision(rid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_staff() or exists(select 1 from public.courses c where c.published_revision_id=rid and private.has_course(c.id))
$$;
create function private.lesson_available(lid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.lessons l join public.courses c on c.id=l.course_id join public.course_revisions r on r.id=c.published_revision_id
 join public.lesson_revisions lr on lr.revision_id=r.id and lr.lesson_id=l.id join public.module_revisions mr on mr.revision_id=r.id and mr.module_id=lr.module_id
 where l.id=lid and lr.published and private.has_course(c.id) and (not r.sequential or not exists(
 select 1 from public.lesson_revisions earlier join public.module_revisions em on em.revision_id=earlier.revision_id and em.module_id=earlier.module_id
 where earlier.revision_id=r.id and earlier.published and (em.position,earlier.position)<(mr.position,lr.position)
 and not exists(select 1 from public.progress p where p.user_id=auth.uid() and p.lesson_id=earlier.lesson_id and p.completed_at is not null))))
$$;
create function private.can_media(mid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.live_session() and exists(select 1 from public.media m where m.id=mid and m.status='ready' and (
 private.is_staff() or (m.purpose='avatar' and m.owner_id=auth.uid()) or
 exists(select 1 from public.courses c join public.course_revisions r on r.id=c.published_revision_id where r.cover_id=mid and private.has_course(c.id)) or
 exists(select 1 from public.block_assets a join public.lesson_blocks b on b.revision_id=a.revision_id and b.id=a.block_id
 join public.lessons l on l.id=b.lesson_id join public.courses c on c.id=l.course_id
 where a.media_id=mid and a.revision_id=c.published_revision_id and private.lesson_available(b.lesson_id))))
$$;

-- Read-only API surface. No direct table mutation grants exist for users.
do $$ declare t text; begin
 foreach t in array array['profiles','user_roles','categories','media','courses','course_revisions','tags','revision_tags','modules','lessons','module_revisions','lesson_revisions','lesson_blocks','block_assets','slug_aliases','lesson_slug_aliases','enrollments','access_grants','progress','saved_items','settings','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
alter table private.rate_limits enable row level security;
alter table private.admin_sessions enable row level security;
create policy profile_read on public.profiles for select to authenticated using (private.live_session() and (id=(select auth.uid()) or private.is_staff(true)));
create policy role_read on public.user_roles for select to authenticated using (private.live_session() and (user_id=(select auth.uid()) or private.is_staff(true)));
create policy categories_read on public.categories for select to authenticated using(private.live_session());
create policy tags_read on public.tags for select to authenticated using(private.live_session());
create policy media_read on public.media for select to authenticated using(private.can_media(id) or (private.is_staff() and status<>'deleted') or (private.live_session() and owner_id=(select auth.uid()) and purpose='avatar'));
create policy courses_read on public.courses for select to authenticated using(deleted_at is null and (private.is_staff() or private.has_course(id)));
create policy revisions_read on public.course_revisions for select to authenticated using(private.can_revision(id));
create policy revision_tags_read on public.revision_tags for select to authenticated using(private.can_revision(revision_id));
create policy modules_read on public.modules for select to authenticated using(private.is_staff() or (private.has_course(course_id) and exists(select 1 from public.courses c join public.module_revisions m on m.revision_id=c.published_revision_id where c.id=course_id and m.module_id=modules.id)));
create policy lessons_read on public.lessons for select to authenticated using(private.is_staff() or (private.has_course(course_id) and exists(select 1 from public.courses c join public.lesson_revisions l on l.revision_id=c.published_revision_id where c.id=course_id and l.lesson_id=lessons.id and l.published)));
create policy module_revision_read on public.module_revisions for select to authenticated using(private.can_revision(revision_id));
create policy lesson_revision_read on public.lesson_revisions for select to authenticated using(private.is_staff() or (published and private.can_revision(revision_id)));
create policy blocks_read on public.lesson_blocks for select to authenticated using(private.is_staff() or (private.can_revision(revision_id) and private.lesson_available(lesson_id)));
create policy block_assets_read on public.block_assets for select to authenticated using(private.is_staff() or (private.can_revision(revision_id) and private.can_media(media_id)));
create policy aliases_read on public.slug_aliases for select to authenticated using(private.is_staff() or private.has_course(course_id));
create policy lesson_aliases_read on public.lesson_slug_aliases for select to authenticated using(private.is_staff() or private.has_course(course_id));
create policy enrollments_read on public.enrollments for select to authenticated using(private.live_session() and (user_id=(select auth.uid()) or private.is_staff(true)));
create policy grants_read on public.access_grants for select to authenticated using(exists(select 1 from public.enrollments e where e.id=enrollment_id));
create policy progress_read on public.progress for select to authenticated using(private.live_session() and (user_id=(select auth.uid()) or private.is_staff(true)));
create policy saved_read on public.saved_items for select to authenticated using(user_id=(select auth.uid()) and private.has_course(course_id) and (lesson_id is null or private.lesson_available(lesson_id)));
create policy settings_read on public.settings for select to authenticated using(private.is_staff(true));
create policy audit_read on public.audit_logs for select to authenticated using(private.is_staff(true));

grant execute on function private.live_session(),private.is_staff(boolean),private.staff_identity(boolean),private.has_course(uuid),private.can_revision(uuid),private.lesson_available(uuid),private.can_media(uuid) to authenticated;
grant execute on function private.touch_staff_session(),public.touch_staff_session(),private.user_limit(text),public.consume_user_limit(text) to authenticated;
grant execute on function private.service_limit(text,integer,integer),public.consume_service_limit(text,integer,integer) to service_role;

-- Private buckets deliberately have NO user Storage policies: signed permissions
-- are issued by the server only after an RLS-authorized application query.
insert into storage.buckets(id,name,public,file_size_limit) values('academy-private','academy-private',false,52428800) on conflict(id) do nothing;
