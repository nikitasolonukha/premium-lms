create function public.catalog(q text default '',category uuid default null,tag text default '',sort text default 'recent',page integer default 1,staff boolean default false,saved boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; retry integer;
begin
 if not private.live_session() or (staff and not private.is_staff()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if length(q)>200 or length(tag)>40 or page not between 1 and 10000 or sort not in ('recent','title','progress') then raise exception 'INVALID_QUERY'; end if;
 if q<>'' then retry:=private.user_limit('search'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if; end if;
 with available as (
 select c.id,c.slug,c.created_at,c.updated_at,c.published_revision_id is not null as published,c.draft_revision_id is not null as has_draft,
 r.id as revision_id,r.title,r.summary,r.author,r.cover_id,r.accent,r.featured,r.category_id,r.version,r.sequential,r.access_mode,
 cat.name as category_name,
 (select count(*)::int from public.lesson_revisions l where l.revision_id=r.id and (staff or l.published)) as lesson_count,
 (select coalesce(sum(l.duration),0)::int from public.lesson_revisions l where l.revision_id=r.id and (staff or l.published)) as duration,
 (select count(*)::int from public.progress p join public.lesson_revisions l on l.lesson_id=p.lesson_id and l.revision_id=c.published_revision_id and l.published where p.user_id=auth.uid() and p.completed_at is not null) as completed_count,
 (select max(p.last_opened_at) from public.progress p where p.course_id=c.id and p.user_id=auth.uid()) as last_activity,
 (select p.lesson_id from public.progress p where p.course_id=c.id and p.user_id=auth.uid() order by p.last_opened_at desc limit 1) as last_lesson_id,
 exists(select 1 from public.saved_items si where si.course_id=c.id and si.lesson_id is null and si.user_id=auth.uid()) as saved,
 coalesce((select jsonb_agg(t.name) from public.tags t join public.revision_tags rt on rt.tag_id=t.id where rt.revision_id=r.id),'[]'::jsonb) as tags
 from public.courses c join public.course_revisions r on r.id=case when staff then coalesce(c.draft_revision_id,c.published_revision_id) else c.published_revision_id end
 left join public.categories cat on cat.id=r.category_id
 where c.deleted_at is null and (staff or private.has_course(c.id))
 and (category is null or r.category_id=category)
 and (tag='' or exists(select 1 from public.revision_tags rt join public.tags t on t.id=rt.tag_id where rt.revision_id=r.id and t.name=tag))
 and (not saved or exists(select 1 from public.saved_items si where si.course_id=c.id and si.user_id=auth.uid()))
 and (q='' or r.search_vector @@ websearch_to_tsquery('russian',q) or r.search_vector @@ websearch_to_tsquery('english',q)
 or strpos(lower(r.title),lower(q))>0 or exists(select 1 from public.lesson_revisions l where l.revision_id=r.id and (staff or l.published) and strpos(lower(l.title),lower(q))>0))
 ), cards as (select *,case when lesson_count=0 then 0 else round(least(completed_count,lesson_count)::numeric/lesson_count*100)::int end as progress from available),
 paged as (select * from cards order by case when sort='title' then title end asc,case when sort='progress' then progress end desc,case when sort='recent' then coalesce(last_activity,updated_at) end desc,id limit 12 offset (page-1)*12)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from cards),'page',page,'pageSize',12) into result;
 return result;
end $$;

create function private.list_users(q text default '',role_filter text default '',course_filter uuid default null,verified_filter text default '',page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_staff(true);
 if length(q)>200 or page not between 1 and 10000 or role_filter not in ('','student','editor','admin') or verified_filter not in ('','yes','no') then raise exception 'INVALID_QUERY'; end if;
 with filtered as (
 select p.id,p.first_name,p.last_name,p.created_at,p.disabled_at,u.email,u.email_confirmed_at,u.last_sign_in_at,r.role,
 (select count(*)::integer from public.enrollments e join public.access_grants g on g.enrollment_id=e.id where e.user_id=p.id and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())) as course_count
 from public.profiles p join auth.users u on u.id=p.id join public.user_roles r on r.user_id=p.id
 where (q='' or strpos(lower(p.first_name||' '||p.last_name||' '||u.email),lower(q))>0) and (role_filter='' or r.role=role_filter)
 and (verified_filter='' or (u.email_confirmed_at is not null)=(verified_filter='yes'))
 and (course_filter is null or exists(select 1 from public.enrollments e join public.access_grants g on g.enrollment_id=e.id where e.user_id=p.id and e.course_id=course_filter and g.revoked_at is null and (g.expires_at is null or g.expires_at>now())))
 ), paged as(select * from filtered order by created_at desc,id limit 20 offset (page-1)*20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from filtered),'page',page,'pageSize',20) into result;
 return result;
end $$;
create function public.list_users(q text default '',role_filter text default '',course_filter uuid default null,verified_filter text default '',page integer default 1) returns jsonb language sql security invoker set search_path='' as $$ select private.list_users(q,role_filter,course_filter,verified_filter,page) $$;

create function private.analytics() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
 activity as (select d::date as day,count(distinct p.user_id)::int as active from generate_series(current_date-29,current_date,interval '1 day') d left join public.progress p on p.last_opened_at>=d and p.last_opened_at<d+interval '1 day' group by d order by d)
 select jsonb_build_object('users',(select count(*) from public.profiles where disabled_at is null),
 'active30',(select count(distinct user_id) from public.progress where last_opened_at>now()-interval '30 days'),
 'courses',coalesce((select jsonb_agg(to_jsonb(course_stats)) from course_stats),'[]'::jsonb),
 'activity',coalesce((select jsonb_agg(to_jsonb(activity)) from activity),'[]'::jsonb),
 'recent',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.last_opened_at,p.completed_at,pr.first_name,pr.last_name,r.title as course,l.title as lesson from public.progress p join public.profiles pr on pr.id=p.user_id join public.courses c on c.id=p.course_id join public.course_revisions r on r.id=c.published_revision_id join public.lesson_revisions l on l.revision_id=r.id and l.lesson_id=p.lesson_id where c.deleted_at is null order by p.last_opened_at desc limit 10)x),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.analytics() returns jsonb language sql security invoker set search_path='' as $$ select private.analytics() $$;

create function private.create_media(mid uuid,filename text,mime_type text,size_bytes bigint,purpose text default 'course') returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer; result public.media;
begin
 if not private.live_session() or (purpose<>'avatar' and not private.is_staff()) or (purpose='branding' and not private.is_staff(true)) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 retry:=private.user_limit(case when purpose='avatar' then 'learning' else 'admin' end); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if mime_type not in ('image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip') or filename ~ '[[:cntrl:]/\\]' then raise exception 'INVALID_FILE'; end if;
 if purpose in ('avatar','branding') and (mime_type not like 'image/%' or size_bytes>5242880) then raise exception 'INVALID_IMAGE'; end if;
 insert into public.media(id,owner_id,object_key,filename,mime_type,size_bytes,purpose) values(mid,auth.uid(),auth.uid()::text||'/'||mid::text,filename,mime_type,size_bytes,purpose) on conflict(id) do nothing;
 select * into result from public.media where id=mid and owner_id=auth.uid();
 if result.id is null or result.filename<>filename or result.size_bytes<>size_bytes or result.mime_type<>mime_type or result.status<>'pending' then raise exception 'UPLOAD_CONFLICT'; end if;
 return to_jsonb(result);
end $$;
create function public.create_media(mid uuid,filename text,mime_type text,size_bytes bigint,purpose text default 'course') returns jsonb language sql security invoker set search_path='' as $$ select private.create_media(mid,filename,mime_type,size_bytes,purpose) $$;

create function private.finalize_media(mid uuid,owner uuid,sha text,width integer default null,height integer default null,accepted boolean default true) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if length(sha)<>64 then raise exception 'INVALID_DIGEST'; end if;
 update public.media m set status=case when accepted then 'ready' else 'rejected' end,sha256=sha,width=finalize_media.width,height=finalize_media.height
 where id=mid and owner_id=owner and status='pending';
 return found;
end $$;
create function public.finalize_media(mid uuid,owner uuid,sha text,width integer default null,height integer default null,accepted boolean default true) returns boolean language sql security invoker set search_path='' as $$ select private.finalize_media(mid,owner,sha,width,height,accepted) $$;
create function private.delete_media(mid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
 perform private.require_staff(); retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if exists(select 1 from public.block_assets where media_id=mid) or exists(select 1 from public.course_revisions where cover_id=mid) or exists(select 1 from public.profiles where avatar_id=mid)
 or exists(select 1 from public.settings where config->>'logo_asset_id'=mid::text or config->>'favicon_asset_id'=mid::text) then raise exception 'ASSET_IN_USE'; end if;
 update public.media set status='deleted' where id=mid;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'media.delete','media',mid::text);
 return jsonb_build_object('ok',true);
end $$;
create function public.delete_media(mid uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.delete_media(mid) $$;

create function public.library(q text default '',page integer default 1) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; retry integer;
begin
 if not private.live_session() then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if length(q)>200 or page not between 1 and 10000 then raise exception 'INVALID_QUERY'; end if;
 if q<>'' then retry:=private.user_limit('search'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if; end if;
 with files as(select distinct m.id,m.filename,m.mime_type,m.size_bytes,m.created_at,c.slug as course_slug,r.title as course_title,l.slug as lesson_slug,l.title as lesson_title
 from public.media m join public.block_assets a on a.media_id=m.id join public.lesson_blocks b on b.revision_id=a.revision_id and b.id=a.block_id
 join public.courses c on c.published_revision_id=b.revision_id join public.course_revisions r on r.id=c.published_revision_id
 join public.lesson_revisions l on l.revision_id=b.revision_id and l.lesson_id=b.lesson_id
 where b.type='file' and private.lesson_available(l.lesson_id) and (q='' or strpos(lower(m.filename||' '||l.title),lower(q))>0)),
 paged as(select * from files order by created_at desc,id limit 20 offset (page-1)*20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from files),'page',page,'pageSize',20) into result;
 return result;
end $$;

grant execute on function public.catalog(text,uuid,text,text,integer,boolean,boolean),public.library(text,integer),private.list_users(text,text,uuid,text,integer),public.list_users(text,text,uuid,text,integer),private.analytics(),public.analytics(),private.create_media(uuid,text,text,bigint,text),public.create_media(uuid,text,text,bigint,text),private.delete_media(uuid),public.delete_media(uuid) to authenticated;
grant execute on function private.finalize_media(uuid,uuid,text,integer,integer,boolean),public.finalize_media(uuid,uuid,text,integer,integer,boolean) to service_role;
