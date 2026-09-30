begin;

create or replace function private.save_course_unvalidated(doc jsonb, expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
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
       for a in select value from jsonb_array_elements(case when (b->>'type' in ('image','file') or (b->>'type'='video' and b->'data'->>'provider'='upload')) then jsonb_build_array(jsonb_build_object('assetId',b->'data'->>'assetId')) when b->>'type'='gallery' then b->'data'->'items' else '[]'::jsonb end) loop
         if not exists(select 1 from public.media where id=(a->>'assetId')::uuid and status='ready' and purpose='course') then raise exception 'INVALID_ASSET'; end if;
         if b->>'type'='video' and not exists(select 1 from public.media where id=(a->>'assetId')::uuid and mime_type='video/mp4' and duration_seconds is not null) then raise exception 'INVALID_VIDEO';end if;
         insert into public.block_assets values(rid,(b->>'id')::uuid,(a->>'assetId')::uuid) on conflict do nothing;
       end loop;
     end loop;
   end loop;
 end loop;
 update public.courses set updated_at=now() where id=cid;
 if is_new then insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(auth.uid(),'course.create','course',cid::text); end if;
 return jsonb_build_object('id',cid,'version',current_version+1,'revisionId',rid);
end $$;


create or replace function private.validate_semantics_base(doc jsonb,settings_doc boolean default false) returns void language plpgsql stable set search_path='' as $$
declare stack jsonb[]:=array[doc];depths integer[]:=array[0];node jsonb;depth integer;n integer;visited integer:=0;pair record;child jsonb;host text;source text;provider text;
begin
 if doc is null or octet_length(doc::text)>2000000 then raise exception 'INVALID_DOCUMENT'; end if;
 while cardinality(stack)>0 loop
  n:=cardinality(stack);node:=stack[n];depth:=depths[n];stack:=stack[1:n-1];depths:=depths[1:n-1];visited:=visited+1;
  if depth>64 or visited>60000 then raise exception 'INVALID_DOCUMENT_DEPTH'; end if;
  if jsonb_typeof(node)='object' then
   for pair in select * from jsonb_each(node) loop
    if pair.key in ('href','url') and not private.safe_https(pair.value#>>'{}') then raise exception 'INVALID_URL'; end if;
    stack:=array_append(stack,pair.value);depths:=array_append(depths,depth+1);
   end loop;
   if node->>'type'='video' then
    source:=node->'data'->>'url';provider:=node->'data'->>'provider';host:=lower(substring(source from '^https://([^/:?#]+)'));
    if provider='upload' then
      if node->'data' ? 'url' or node->'data' ? 'sourceId' or not exists(select 1 from public.media where id=(node->'data'->>'assetId')::uuid and status='ready' and mime_type='video/mp4' and duration_seconds is not null) then raise exception 'INVALID_VIDEO';end if;
    elsif provider in ('cloudflare','mux') then
      if (provider='cloudflare' and coalesce(node->'data'->>'sourceId','') !~ '^[a-f0-9]{32}$')
        or (provider='mux' and coalesce(node->'data'->>'sourceId','') !~ '^[A-Za-z0-9]{8,128}$')
        or node->'data' ? 'url' then raise exception 'INVALID_VIDEO';end if;
    elsif not private.safe_https(source) or (case provider
      when 'youtube' then host not in ('youtube.com','www.youtube.com','youtu.be','youtube-nocookie.com','www.youtube-nocookie.com')
      when 'vimeo' then host not in ('vimeo.com','www.vimeo.com','player.vimeo.com')
      when 'rutube' then host not in ('rutube.ru','www.rutube.ru')
      when 'direct' then source !~* '\.(mp4|webm|ogg)([?#].*)?$'
      when 'external' then not exists(select 1 from public.settings s,jsonb_array_elements_text(s.config->'embed_origins') origin where rtrim(origin,'/')=substring(source from '^(https://[^/?#]+)'))
      else true end) then raise exception 'INVALID_VIDEO'; end if;
   end if;
  elsif jsonb_typeof(node)='array' then
   for child in select value from jsonb_array_elements(node) loop stack:=array_append(stack,child);depths:=array_append(depths,depth+1);end loop;
  end if;
 end loop;
 if settings_doc then
  for source in select jsonb_array_elements_text(doc->'embed_origins') loop if not private.safe_https(source) or source !~ '^https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?/?$' then raise exception 'INVALID_EMBED_ORIGIN';end if;end loop;
  for source in select value from jsonb_array_elements_text(jsonb_build_array(doc->>'logo_asset_id',doc->>'favicon_asset_id')) loop
   if source is not null and not exists(select 1 from public.media where id=source::uuid and status='ready' and purpose='branding' and mime_type like 'image/%') then raise exception 'INVALID_ASSET';end if;
  end loop;
 end if;
end $$;



create or replace function private.save_course(doc jsonb,expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.require_staff();perform private.validate_semantics(doc);
 if not extensions.jsonb_matches_schema($schema${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema1"},"slug":{"$ref":"#/$defs/__schema2"},"title":{"$ref":"#/$defs/__schema3"},"description":{"$ref":"#/$defs/__schema4"},"summary":{"$ref":"#/$defs/__schema5"},"author":{"$ref":"#/$defs/__schema6"},"categoryId":{"$ref":"#/$defs/__schema7"},"tags":{"$ref":"#/$defs/__schema8"},"coverId":{"$ref":"#/$defs/__schema10"},"accent":{"$ref":"#/$defs/__schema11"},"featured":{"$ref":"#/$defs/__schema12"},"accessMode":{"$ref":"#/$defs/__schema13"},"sequential":{"$ref":"#/$defs/__schema14"},"modules":{"$ref":"#/$defs/__schema15"}},"required":["id","version","slug","title","description","summary","author","categoryId","tags","coverId","accent","featured","accessMode","sequential","modules"],"additionalProperties":false,"$defs":{"__schema0":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"__schema1":{"type":"integer","minimum":0,"maximum":9007199254740991},"__schema2":{"type":"string","pattern":"^[a-z0-9][a-z0-9-]{0,79}$"},"__schema3":{"type":"string","minLength":1,"maxLength":180},"__schema4":{"type":"string","maxLength":12000},"__schema5":{"type":"string","maxLength":400},"__schema6":{"type":"string","maxLength":180},"__schema7":{"anyOf":[{"$ref":"#/$defs/__schema0"},{"type":"null"}]},"__schema8":{"maxItems":12,"type":"array","items":{"$ref":"#/$defs/__schema9"}},"__schema9":{"type":"string","minLength":1,"maxLength":40},"__schema10":{"anyOf":[{"$ref":"#/$defs/__schema0"},{"type":"null"}]},"__schema11":{"type":"string","enum":["blue","lime","lilac","peach"]},"__schema12":{"type":"boolean"},"__schema13":{"type":"string","enum":["restricted","registered"]},"__schema14":{"type":"boolean"},"__schema15":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/__schema16"}},"__schema16":{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"title":{"$ref":"#/$defs/__schema3"},"lessons":{"maxItems":200,"type":"array","items":{"$ref":"#/$defs/__schema17"}}},"required":["id","title","lessons"],"additionalProperties":false},"__schema17":{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"slug":{"type":"string","pattern":"^[a-z0-9][a-z0-9-]{0,99}$"},"title":{"$ref":"#/$defs/__schema3"},"duration":{"type":"integer","minimum":0,"maximum":1440},"published":{"type":"boolean"},"blocks":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/__schema18"}}},"required":["id","slug","title","duration","published","blocks"],"additionalProperties":false},"__schema18":{"oneOf":[{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"heading"},"data":{"type":"object","properties":{"text":{"$ref":"#/$defs/__schema3"},"level":{"anyOf":[{"type":"number","const":2},{"type":"number","const":3}]}},"required":["text","level"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"rich_text"},"data":{"type":"object","properties":{"document":{"$ref":"#/$defs/__schema20"}},"required":["document"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"image"},"data":{"type":"object","properties":{"assetId":{"$ref":"#/$defs/__schema0"},"alt":{"type":"string","maxLength":300},"caption":{"type":"string","maxLength":500}},"required":["assetId","alt"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"video"},"data":{"oneOf":[{"type":"object","properties":{"provider":{"type":"string","const":"upload"},"assetId":{"$ref":"#/$defs/__schema0"},"title":{"$ref":"#/$defs/__schema3"}},"required":["provider","assetId","title"],"additionalProperties":false},{"type":"object","properties":{"provider":{"type":"string","enum":["youtube","vimeo","rutube","direct","external"]},"url":{"$ref":"#/$defs/__schema22"},"title":{"$ref":"#/$defs/__schema3"}},"required":["provider","url","title"],"additionalProperties":false},{"type":"object","properties":{"provider":{"type":"string","const":"cloudflare"},"sourceId":{"type":"string","pattern":"^[a-f0-9]{32}$"},"title":{"$ref":"#/$defs/__schema3"}},"required":["provider","sourceId","title"],"additionalProperties":false},{"type":"object","properties":{"provider":{"type":"string","const":"mux"},"sourceId":{"type":"string","pattern":"^[A-Za-z0-9]{8,128}$"},"title":{"$ref":"#/$defs/__schema3"}},"required":["provider","sourceId","title"],"additionalProperties":false}]}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"file"},"data":{"type":"object","properties":{"assetId":{"$ref":"#/$defs/__schema0"},"label":{"$ref":"#/$defs/__schema3"}},"required":["assetId","label"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"link"},"data":{"type":"object","properties":{"url":{"$ref":"#/$defs/__schema22"},"label":{"$ref":"#/$defs/__schema3"}},"required":["url","label"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"quote"},"data":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":4000},"author":{"type":"string","maxLength":180}},"required":["text","author"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"callout"},"data":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":4000},"tone":{"type":"string","enum":["info","success","warning"]}},"required":["text","tone"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"divider"},"data":{"type":"object","properties":{},"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"code"},"data":{"type":"object","properties":{"code":{"type":"string","maxLength":20000},"language":{"type":"string","maxLength":30}},"required":["code","language"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"gallery"},"data":{"type":"object","properties":{"items":{"minItems":1,"maxItems":12,"type":"array","items":{"$ref":"#/$defs/__schema23"}}},"required":["items"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false}]},"__schema19":{"type":"number","const":1},"__schema20":{"type":"object","properties":{"type":{"type":"string","enum":["doc","paragraph","text","heading","bulletList","orderedList","listItem","blockquote","codeBlock","hardBreak","horizontalRule"]},"text":{"type":"string","maxLength":20000},"attrs":{"type":"object","properties":{"level":{"type":"integer","minimum":1,"maximum":3},"start":{"type":"integer","minimum":1,"maximum":9999},"language":{"anyOf":[{"type":"string","maxLength":30},{"type":"null"}]}},"additionalProperties":false},"marks":{"maxItems":6,"type":"array","items":{"$ref":"#/$defs/__schema21"}},"content":{"maxItems":300,"type":"array","items":{"$ref":"#/$defs/__schema20"}}},"required":["type"],"additionalProperties":false},"__schema21":{"type":"object","properties":{"type":{"type":"string","enum":["bold","italic","strike","code","link","underline"]},"attrs":{"type":"object","properties":{"href":{"$ref":"#/$defs/__schema22"},"target":{"anyOf":[{"type":"string","const":"_blank"},{"type":"null"}]},"rel":{"anyOf":[{"type":"string","maxLength":80},{"type":"null"}]},"class":{"type":"null"}},"additionalProperties":false}},"required":["type"],"additionalProperties":false},"__schema22":{"type":"string","maxLength":2048},"__schema23":{"type":"object","properties":{"assetId":{"$ref":"#/$defs/__schema0"},"alt":{"type":"string","maxLength":300}},"required":["assetId","alt"],"additionalProperties":false}}}$schema$::json,doc) then raise exception 'INVALID_DOCUMENT';end if;
 return private.save_course_unvalidated(doc,expected_version);end $$;

create or replace function private.worker_api(op text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
  update private.operations_jobs set status=case when kind='report' or attempts>=3 then 'failed' else 'queued' end,error_code=case when kind='report' then 'DELIVERY_UNKNOWN' else 'WORKER_INTERRUPTED' end,lease=null
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
 elsif op='report.receipt' then
  recipient:=(payload->>'recipient')::uuid;
  if j.kind<>'report' or not (j.payload->'recipients' @> jsonb_build_array(recipient)) then raise exception 'INVALID_RECIPIENT';end if;
  update private.operations_jobs set result=jsonb_set(result,'{delivered}',coalesce(result->'delivered','[]')||jsonb_build_array(recipient)),heartbeat_at=now() where id=j.id and not coalesce(result->'delivered','[]') @> jsonb_build_array(recipient);
  return jsonb_build_object('ok',true);
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
  if j.kind<>'video' or (payload->>'size')::bigint not between 1 and 2147483648 or (payload->>'duration')::int not between 1 and 14400 or coalesce(payload->>'sha','') !~ '^[a-f0-9]{64}$' or (payload->>'width')::int not between 32 and 1920 or (payload->>'height')::int not between 32 and 1080 then raise exception 'INVALID_OUTPUT'; end if;
  update public.media set status='ready',size_bytes=(payload->>'size')::bigint,sha256=payload->>'sha',width=(payload->>'width')::int,height=(payload->>'height')::int,duration_seconds=(payload->>'duration')::int,video_download_allowed=coalesce((j.payload->>'download')::boolean,false) where id=(j.payload->>'media_id')::uuid and status='pending';
  if not found then raise exception 'CONFLICT'; end if;
  insert into public.media(id,owner_id,object_key,filename,mime_type,size_bytes,status,width,height,variant_version)
  values((j.payload->>'poster_id')::uuid,j.owner_id,j.owner_id::text||'/'||(j.payload->>'poster_id'),'Обложка видео.webp','image/webp',(payload->>'poster_size')::bigint,'ready',(payload->>'poster_width')::int,(payload->>'poster_height')::int,1);
  update private.operations_jobs set status='succeeded',progress=100,result=jsonb_build_object('duration',payload->'duration','size',payload->'size','burned_in',true),updated_at=now(),lease=null where id=j.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id) values(j.owner_id,'video.processed','media',j.payload->>'media_id'); return jsonb_build_object('ok',true);
 elsif op='finish' then
  if j.kind='video' and (payload->>'success')::boolean then raise exception 'USE_VIDEO_COMMIT'; end if;
  if payload->>'error' not in ('NOT_CONFIGURED','DELIVERY_UNKNOWN','DELIVERY_FAILED','IMPORT_FAILED','VIDEO_FAILED','OWNER_REVOKED','WORKER_INTERRUPTED') and not (payload->>'success')::boolean then raise exception 'INVALID_ERROR'; end if;
  update private.operations_jobs set status=case when (payload->>'success')::boolean then 'succeeded' else 'failed' end,error_code=payload->>'error',progress=case when (payload->>'success')::boolean then 100 else progress end,result=case when j.kind='import' then result else result||coalesce(payload->'result','{}') end,updated_at=now(),lease=null where id=j.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'UNKNOWN_WORKER_OPERATION';
end $$;


create or replace function private.download_asset(mid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('object_key',m.object_key,'filename',m.filename,'mime_type',m.mime_type) from public.media m where m.id=mid and m.status='ready' and (m.mime_type<>'video/mp4' or m.video_download_allowed)
$$;

create index automation_rules_owner on private.automation_rules(owner_id);

create index bulk_requests_owner on private.bulk_requests(owner_id);

commit;