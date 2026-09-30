create function private.save_course(doc jsonb, expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 cid uuid := (doc->>'id')::uuid; rid uuid; current_version integer; current_doc public.course_revisions;
 m jsonb; l jsonb; b jsonb; a jsonb; tag text; tid uuid; mi integer:=0; li integer; bi integer; retry integer; is_new boolean:=false;
begin
 perform private.require_staff();
 retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if octet_length(doc::text)>2000000 or jsonb_typeof(doc->'modules')<>'array' or jsonb_array_length(doc->'modules')>100 then raise exception 'INVALID_DOCUMENT'; end if;
 perform 1 from public.courses where id=cid for update;
 if not found then
   if expected_version<>0 then raise exception 'EDIT_CONFLICT'; end if;
   if exists(select 1 from public.slug_aliases where slug=doc->>'slug') then raise exception 'SLUG_TAKEN'; end if;
   insert into public.courses(id,slug,created_by) values(cid,doc->>'slug',auth.uid()); is_new:=true;
 else
   if exists(select 1 from public.courses where id=cid and deleted_at is not null) then raise exception 'COURSE_DELETED'; end if;
 end if;
 select coalesce(c.draft_revision_id,c.published_revision_id) into rid from public.courses c where c.id=cid;
 if rid is not null then select * into current_doc from public.course_revisions where id=rid; current_version:=current_doc.version; else current_version:=0; end if;
 if current_version<>expected_version then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 if not private.is_staff(true) and ((doc->>'accessMode')<>coalesce(current_doc.access_mode,'restricted') or (doc->>'sequential')::boolean<>coalesce(current_doc.sequential,false)) then raise exception 'ADMIN_ONLY' using errcode='42501'; end if;
 if exists(select 1 from public.courses where slug=doc->>'slug' and id<>cid) or exists(select 1 from public.slug_aliases where slug=doc->>'slug' and course_id<>cid) then raise exception 'SLUG_TAKEN'; end if;
 if nullif(doc->>'coverId','') is not null and not exists(select 1 from public.media where id=(doc->>'coverId')::uuid and status='ready' and purpose='course' and mime_type like 'image/%') then raise exception 'INVALID_COVER'; end if;
 if rid is null or current_doc.is_published then
   rid:=gen_random_uuid();
   insert into public.course_revisions(id,course_id,slug,title) values(rid,cid,doc->>'slug',doc->>'title');
   update public.courses set draft_revision_id=rid where id=cid;
 end if;
 update public.course_revisions set version=current_version+1,slug=doc->>'slug',title=doc->>'title',summary=doc->>'summary',description=doc->>'description',author=doc->>'author',
 category_id=(doc->>'categoryId')::uuid,cover_id=(doc->>'coverId')::uuid,accent=doc->>'accent',featured=(doc->>'featured')::boolean,
 access_mode=doc->>'accessMode',sequential=(doc->>'sequential')::boolean,updated_at=now() where id=rid;
 -- Record removal of lesson identities from the working revision before replacement.
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 select auth.uid(),'lesson.delete','lesson',lr.lesson_id::text,jsonb_build_object('course_id',cid)
 from public.lesson_revisions lr where lr.revision_id=rid and not exists(select 1 from jsonb_array_elements(doc->'modules') jm, jsonb_array_elements(jm->'lessons') jl where jl->>'id'=lr.lesson_id::text);
 delete from public.module_revisions where revision_id=rid;
 delete from public.revision_tags where revision_id=rid;
 if jsonb_array_length(doc->'tags')>12 then raise exception 'INVALID_TAGS'; end if;
 for tag in select jsonb_array_elements_text(doc->'tags') loop
   insert into public.tags(name) values(tag) on conflict(name) do update set name=excluded.name returning id into tid;
   insert into public.revision_tags values(rid,tid) on conflict do nothing;
 end loop;
 for m in select value from jsonb_array_elements(doc->'modules') loop
   if jsonb_array_length(m->'lessons')>200 then raise exception 'TOO_MANY_LESSONS'; end if;
   insert into public.modules(id,course_id) values((m->>'id')::uuid,cid) on conflict do nothing;
   insert into public.module_revisions(revision_id,course_id,module_id,title,position) values(rid,cid,(m->>'id')::uuid,m->>'title',mi); mi:=mi+1; li:=0;
   for l in select value from jsonb_array_elements(m->'lessons') loop
     if jsonb_array_length(l->'blocks')>100 then raise exception 'TOO_MANY_BLOCKS'; end if;
     insert into public.lessons(id,course_id) values((l->>'id')::uuid,cid) on conflict do nothing;
     insert into public.lesson_revisions(revision_id,course_id,lesson_id,module_id,slug,title,duration,published,position)
     values(rid,cid,(l->>'id')::uuid,(m->>'id')::uuid,l->>'slug',l->>'title',(l->>'duration')::integer,(l->>'published')::boolean,li); li:=li+1; bi:=0;
     for b in select value from jsonb_array_elements(l->'blocks') loop
       insert into public.lesson_blocks(revision_id,lesson_id,id,position,type,schema_version,data) values(rid,(l->>'id')::uuid,(b->>'id')::uuid,bi,b->>'type',(b->>'version')::integer,b->'data'); bi:=bi+1;
       for a in select value from jsonb_array_elements(case when b->>'type' in ('image','file') then jsonb_build_array(jsonb_build_object('assetId',b->'data'->>'assetId')) when b->>'type'='gallery' then b->'data'->'items' else '[]'::jsonb end) loop
         if not exists(select 1 from public.media where id=(a->>'assetId')::uuid and status='ready' and purpose='course') then raise exception 'INVALID_ASSET'; end if;
         insert into public.block_assets values(rid,(b->>'id')::uuid,(a->>'assetId')::uuid) on conflict do nothing;
       end loop;
     end loop;
   end loop;
 end loop;
 update public.courses set updated_at=now() where id=cid;
 if is_new then insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'course.create','course',cid::text); end if;
 return jsonb_build_object('id',cid,'version',current_version+1,'revisionId',rid);
end $$;
create function public.save_course(doc jsonb, expected_version integer) returns jsonb language sql security invoker set search_path='' as $$ select private.save_course(doc,expected_version) $$;

create function private.course_document(cid uuid, draft boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rid uuid; result jsonb; staff boolean:=private.is_staff();
begin
 if not staff and (draft or not private.has_course(cid)) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
 select case when draft then coalesce(draft_revision_id,published_revision_id) else published_revision_id end into rid from public.courses where id=cid and deleted_at is null;
 if rid is null then return null; end if;
 select jsonb_build_object('id',cid,'version',r.version,'slug',r.slug,'title',r.title,'description',r.description,'summary',r.summary,'author',r.author,
 'categoryId',r.category_id,'coverId',r.cover_id,'accent',r.accent,'featured',r.featured,'accessMode',r.access_mode,'sequential',r.sequential,
 'tags',coalesce((select jsonb_agg(t.name order by t.name) from public.revision_tags rt join public.tags t on t.id=rt.tag_id where rt.revision_id=rid),'[]'::jsonb),
 'modules',coalesce((select jsonb_agg(jsonb_build_object('id',m.module_id,'title',m.title,'lessons',coalesce((
 select jsonb_agg(jsonb_build_object('id',l.lesson_id,'slug',l.slug,'title',l.title,'duration',l.duration,'published',l.published,
 'blocks',case when staff or private.lesson_available(l.lesson_id) then coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'type',b.type,'version',b.schema_version,'data',b.data) order by b.position) from public.lesson_blocks b where b.revision_id=rid and b.lesson_id=l.lesson_id),'[]'::jsonb) else '[]'::jsonb end) order by l.position)
 from public.lesson_revisions l where l.revision_id=rid and l.module_id=m.module_id and (staff or l.published)),'[]'::jsonb)) order by m.position)
 from public.module_revisions m where m.revision_id=rid),'[]'::jsonb)) into result from public.course_revisions r where r.id=rid;
 return result;
end $$;
create function public.course_document(cid uuid, draft boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select private.course_document(cid,draft) $$;

create function private.publish_course(cid uuid, expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.courses; r public.course_revisions; retry integer;
begin
 perform private.require_staff(true); retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 select * into c from public.courses where id=cid and deleted_at is null for update;
 if c.draft_revision_id is null then return jsonb_build_object('id',cid,'unchanged',true); end if;
 select * into r from public.course_revisions where id=c.draft_revision_id;
 if r.version<>expected_version then raise exception 'EDIT_CONFLICT' using errcode='40001'; end if;
 if not exists(select 1 from public.lesson_revisions where revision_id=r.id and published) then raise exception 'EMPTY_COURSE'; end if;
 if exists(select 1 from public.lesson_revisions l where l.revision_id=r.id and l.published and not exists(select 1 from public.lesson_blocks b where b.revision_id=r.id and b.lesson_id=l.lesson_id)) then raise exception 'EMPTY_LESSON'; end if;
 if exists(select 1 from public.block_assets a join public.media m on m.id=a.media_id where a.revision_id=r.id and m.status<>'ready') then raise exception 'INVALID_ASSET'; end if;
 if exists(select 1 from public.slug_aliases where slug=r.slug and course_id<>cid) then raise exception 'SLUG_TAKEN'; end if;
 if c.slug<>r.slug then insert into public.slug_aliases(slug,course_id) values(c.slug,cid) on conflict(slug) do nothing; end if;
 -- Old lesson paths remain attached to stable identities.
 insert into public.lesson_slug_aliases(course_id,slug,lesson_id)
 select cid,old.slug,old.lesson_id from public.lesson_revisions old join public.lesson_revisions new on new.lesson_id=old.lesson_id and new.revision_id=r.id
 where old.revision_id=c.published_revision_id and old.slug<>new.slug on conflict do nothing;
 if exists(select 1 from public.lesson_slug_aliases a join public.lesson_revisions l on l.revision_id=r.id and l.slug=a.slug where a.course_id=cid and a.lesson_id<>l.lesson_id) then raise exception 'LESSON_SLUG_RESERVED'; end if;
 update public.course_revisions set is_published=true where id=r.id;
 update public.courses set published_revision_id=r.id,draft_revision_id=null,slug=r.slug,updated_at=now() where id=cid;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'course.publish','course',cid::text,jsonb_build_object('revision_id',r.id,'version',r.version));
 return jsonb_build_object('id',cid,'revisionId',r.id);
end $$;
create function public.publish_course(cid uuid, expected_version integer) returns jsonb language sql security invoker set search_path='' as $$ select private.publish_course(cid,expected_version) $$;

create function private.delete_course(cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
 perform private.require_staff(true); retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 update public.courses set deleted_at=now(),updated_at=now() where id=cid and deleted_at is null;
 if found then insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'course.delete','course',cid::text); end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.delete_course(cid uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.delete_course(cid) $$;

create function private.set_access(target_user uuid,cid uuid,enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare eid uuid; retry integer;
begin
 perform private.require_staff(true); retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if not exists(select 1 from public.courses where id=cid and deleted_at is null) then raise exception 'NOT_FOUND'; end if;
 insert into public.enrollments(user_id,course_id) values(target_user,cid) on conflict(user_id,course_id) do update set user_id=excluded.user_id returning id into eid;
 insert into public.access_grants(enrollment_id,granted_by,revoked_at) values(eid,auth.uid(),case when enabled then null else now() end)
 on conflict(enrollment_id,source) do update set revoked_at=excluded.revoked_at,granted_by=excluded.granted_by,expires_at=null;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),case when enabled then 'access.grant' else 'access.revoke' end,'course',cid::text,jsonb_build_object('user_id',target_user));
 return jsonb_build_object('ok',true);
end $$;
create function public.set_access(target_user uuid,cid uuid,enabled boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.set_access(target_user,cid,enabled) $$;

create function private.set_role(target_user uuid,new_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare old_role text; retry integer;
begin
 perform private.require_staff(true); retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if new_role not in ('student','editor','admin') then raise exception 'INVALID_ROLE'; end if;
 -- Serializes all role and disable changes, including concurrent last-admin demotions.
 perform pg_advisory_xact_lock(77124001);
 select role into old_role from public.user_roles where user_id=target_user for update;
 if old_role='admin' and new_role<>'admin' and (select count(*) from public.user_roles r join public.profiles p on p.id=r.user_id where r.role='admin' and p.disabled_at is null)<=1 then raise exception 'LAST_ADMIN'; end if;
 update public.user_roles set role=new_role,updated_at=now() where user_id=target_user;
 update private.admin_sessions set revoked_at=now() where user_id=target_user;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'user.role','user',target_user::text,jsonb_build_object('before',old_role,'after',new_role));
 return jsonb_build_object('ok',true);
end $$;
create function public.set_role(target_user uuid,new_role text) returns jsonb language sql security invoker set search_path='' as $$ select private.set_role(target_user,new_role) $$;

create function private.set_user_disabled(target_user uuid,disabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
 perform private.require_staff(true); retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 perform pg_advisory_xact_lock(77124001);
 if disabled and exists(select 1 from public.user_roles where user_id=target_user and role='admin') and (select count(*) from public.user_roles r join public.profiles p on p.id=r.user_id where r.role='admin' and p.disabled_at is null)<=1 then raise exception 'LAST_ADMIN'; end if;
 update public.profiles set disabled_at=case when disabled then now() else null end,updated_at=now() where id=target_user;
 if disabled then delete from auth.sessions where user_id=target_user; end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'user.disable','user',target_user::text,jsonb_build_object('disabled',disabled));
 return jsonb_build_object('ok',true);
end $$;
create function public.set_user_disabled(target_user uuid,disabled boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.set_user_disabled(target_user,disabled) $$;

create function private.record_progress(lid uuid,complete boolean default false,seconds integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid; retry integer;
begin
 retry:=private.user_limit('learning'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if not private.lesson_available(lid) then raise exception 'LESSON_LOCKED' using errcode='42501'; end if;
 select course_id into cid from public.lessons where id=lid;
 if seconds not between 0 and 86400 then raise exception 'INVALID_POSITION'; end if;
 insert into public.progress(user_id,lesson_id,course_id,completed_at,playback_seconds) values(auth.uid(),lid,cid,case when complete then now() end,seconds)
 on conflict(user_id,lesson_id) do update set last_opened_at=now(),completed_at=coalesce(progress.completed_at,excluded.completed_at),playback_seconds=greatest(progress.playback_seconds,excluded.playback_seconds);
 return jsonb_build_object('ok',true);
end $$;
create function public.record_progress(lid uuid,complete boolean default false,seconds integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select private.record_progress(lid,complete,seconds) $$;

create function private.save_item(cid uuid,lid uuid,enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
 retry:=private.user_limit('learning'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if not private.has_course(cid) or (lid is not null and (not private.lesson_available(lid) or not exists(select 1 from public.lessons where id=lid and course_id=cid))) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
 if enabled then insert into public.saved_items(user_id,course_id,lesson_id) values(auth.uid(),cid,lid) on conflict do nothing;
 else delete from public.saved_items where user_id=auth.uid() and course_id=cid and lesson_id is not distinct from lid; end if;
 return jsonb_build_object('ok',true);
end $$;
create function public.save_item(cid uuid,lid uuid,enabled boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.save_item(cid,lid,enabled) $$;

create function private.update_profile(first_name text,last_name text,avatar_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
 retry:=private.user_limit('learning'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if avatar_id is not null and not exists(select 1 from public.media m where m.id=avatar_id and m.owner_id=auth.uid() and m.purpose='avatar' and m.status='ready') then raise exception 'INVALID_AVATAR'; end if;
 update public.profiles p set first_name=update_profile.first_name,last_name=update_profile.last_name,avatar_id=update_profile.avatar_id,updated_at=now() where id=auth.uid();
 return jsonb_build_object('ok',true);
end $$;
create function public.update_profile(first_name text,last_name text,avatar_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.update_profile(first_name,last_name,avatar_id) $$;

create function private.branding() returns jsonb language sql stable security definer set search_path='' as $$
 select config - 'embed_origins' - 'content_watermark_enabled' from public.settings where id=true
$$;
create function public.branding() returns jsonb language sql security invoker set search_path='' as $$ select private.branding() $$;
create function private.runtime_settings() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.live_session() then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
 return (select config from public.settings where id=true);
end $$;
create function public.runtime_settings() returns jsonb language sql security invoker set search_path='' as $$ select private.runtime_settings() $$;
create function private.update_settings(doc jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
 perform private.require_staff(true); retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if jsonb_typeof(doc)<>'object' or octet_length(doc::text)>20000 then raise exception 'INVALID_SETTINGS'; end if;
 update public.settings set config=doc,updated_at=now() where id=true;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata) values(auth.uid(),'settings.update','settings','academy',jsonb_build_object('fields',(select jsonb_agg(k) from jsonb_object_keys(doc) k)));
 return jsonb_build_object('ok',true);
end $$;
create function public.update_settings(doc jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.update_settings(doc) $$;

create function private.mutate_category(cid uuid,label text,color text,remove boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
 perform private.require_staff(true); retry:=private.user_limit('admin'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if remove then delete from public.categories where id=cid;
 else insert into public.categories(id,name,color) values(cid,label,color) on conflict(id) do update set name=excluded.name,color=excluded.color; end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),case when remove then 'category.delete' else 'category.save' end,'category',cid::text);
 return jsonb_build_object('ok',true);
end $$;
create function public.mutate_category(cid uuid,label text,color text,remove boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select private.mutate_category(cid,label,color,remove) $$;

grant usage on schema private to anon;
grant execute on function private.branding(),public.branding() to anon,authenticated;
grant execute on function private.save_course(jsonb,integer), public.save_course(jsonb,integer),private.course_document(uuid,boolean),public.course_document(uuid,boolean),private.publish_course(uuid,integer),public.publish_course(uuid,integer),private.delete_course(uuid),public.delete_course(uuid),private.set_access(uuid,uuid,boolean),public.set_access(uuid,uuid,boolean),private.set_role(uuid,text),public.set_role(uuid,text),private.set_user_disabled(uuid,boolean),public.set_user_disabled(uuid,boolean),private.record_progress(uuid,boolean,integer),public.record_progress(uuid,boolean,integer),private.save_item(uuid,uuid,boolean),public.save_item(uuid,uuid,boolean),private.update_profile(text,text,uuid),public.update_profile(text,text,uuid),private.runtime_settings(),public.runtime_settings(),private.update_settings(jsonb),public.update_settings(jsonb),private.mutate_category(uuid,text,text,boolean),public.mutate_category(uuid,text,text,boolean) to authenticated;
