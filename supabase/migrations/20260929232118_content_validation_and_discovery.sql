create extension if not exists pg_jsonschema with schema extensions;

create function private.safe_https(value text) returns boolean language sql immutable set search_path='' as $$
 select value is not null and length(value)<=2048 and value ~ '^https://[a-zA-Z0-9][a-zA-Z0-9.-]*(:[0-9]{1,5})?([/?#][^[:cntrl:] ]*)?$'
 and lower(substring(value from '^https://([^/:?#]+)')) !~ '(^|\.)(localhost|local)\.*$'
 and lower(substring(value from '^https://([^/:?#]+)')) !~ '^[0-9.]+$'
$$;

-- Full JSON Schema snapshots are appended below. This semantic pass is iterative
-- and rejects oversized/deep trees before the recursive schema validator runs.
create function private.validate_semantics(doc jsonb,settings_doc boolean default false) returns void language plpgsql stable set search_path='' as $$
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
    if not private.safe_https(source) or (case provider
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

create function public.lesson_index(q text default '',page integer default 1,saved boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;retry integer;
begin
 if not private.live_session() then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if length(q)>200 or page not between 1 and 10000 then raise exception 'INVALID_QUERY';end if;
 if q<>'' then retry:=private.user_limit('search');if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry);end if;end if;
 with available as (
  select l.lesson_id,l.title,l.slug,c.slug as course_slug,r.title as course_title,
   exists(select 1 from public.saved_items s where s.lesson_id=l.lesson_id and s.user_id=auth.uid()) as saved,
   private.lesson_available(l.lesson_id) as available
  from public.lesson_revisions l join public.courses c on c.published_revision_id=l.revision_id join public.course_revisions r on r.id=c.published_revision_id
  where l.published and private.has_course(c.id)
   and (not saved or exists(select 1 from public.saved_items s where s.lesson_id=l.lesson_id and s.user_id=auth.uid()))
   and (q='' or strpos(lower(l.title),lower(q))>0 or to_tsvector('russian',l.title)@@websearch_to_tsquery('russian',q) or to_tsvector('english',l.title)@@websearch_to_tsquery('english',q))
 ),paged as(select * from available order by course_title,title,lesson_id limit 20 offset(page-1)*20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from available),'page',page,'pageSize',20) into result;
 return result;
end $$;
grant execute on function public.lesson_index(text,integer,boolean) to authenticated;

alter function private.save_course(jsonb,integer) rename to save_course_unvalidated;
revoke all on function private.save_course_unvalidated(jsonb,integer) from authenticated,anon,public;
create function private.save_course(doc jsonb,expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_staff();perform private.validate_semantics(doc);
 if not extensions.jsonb_matches_schema($schema${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema1"},"slug":{"$ref":"#/$defs/__schema2"},"title":{"$ref":"#/$defs/__schema3"},"description":{"$ref":"#/$defs/__schema4"},"summary":{"$ref":"#/$defs/__schema5"},"author":{"$ref":"#/$defs/__schema6"},"categoryId":{"$ref":"#/$defs/__schema7"},"tags":{"$ref":"#/$defs/__schema8"},"coverId":{"$ref":"#/$defs/__schema10"},"accent":{"$ref":"#/$defs/__schema11"},"featured":{"$ref":"#/$defs/__schema12"},"accessMode":{"$ref":"#/$defs/__schema13"},"sequential":{"$ref":"#/$defs/__schema14"},"modules":{"$ref":"#/$defs/__schema15"}},"required":["id","version","slug","title","description","summary","author","categoryId","tags","coverId","accent","featured","accessMode","sequential","modules"],"additionalProperties":false,"$defs":{"__schema0":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"__schema1":{"type":"integer","minimum":0,"maximum":9007199254740991},"__schema2":{"type":"string","pattern":"^[a-z0-9][a-z0-9-]{0,79}$"},"__schema3":{"type":"string","minLength":1,"maxLength":180},"__schema4":{"type":"string","maxLength":12000},"__schema5":{"type":"string","maxLength":400},"__schema6":{"type":"string","maxLength":180},"__schema7":{"anyOf":[{"$ref":"#/$defs/__schema0"},{"type":"null"}]},"__schema8":{"maxItems":12,"type":"array","items":{"$ref":"#/$defs/__schema9"}},"__schema9":{"type":"string","minLength":1,"maxLength":40},"__schema10":{"anyOf":[{"$ref":"#/$defs/__schema0"},{"type":"null"}]},"__schema11":{"type":"string","enum":["blue","lime","lilac","peach"]},"__schema12":{"type":"boolean"},"__schema13":{"type":"string","enum":["restricted","registered"]},"__schema14":{"type":"boolean"},"__schema15":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/__schema16"}},"__schema16":{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"title":{"$ref":"#/$defs/__schema3"},"lessons":{"maxItems":200,"type":"array","items":{"$ref":"#/$defs/__schema17"}}},"required":["id","title","lessons"],"additionalProperties":false},"__schema17":{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"slug":{"type":"string","pattern":"^[a-z0-9][a-z0-9-]{0,99}$"},"title":{"$ref":"#/$defs/__schema3"},"duration":{"type":"integer","minimum":0,"maximum":1440},"published":{"type":"boolean"},"blocks":{"maxItems":100,"type":"array","items":{"$ref":"#/$defs/__schema18"}}},"required":["id","slug","title","duration","published","blocks"],"additionalProperties":false},"__schema18":{"oneOf":[{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"heading"},"data":{"type":"object","properties":{"text":{"$ref":"#/$defs/__schema3"},"level":{"anyOf":[{"type":"number","const":2},{"type":"number","const":3}]}},"required":["text","level"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"rich_text"},"data":{"type":"object","properties":{"document":{"$ref":"#/$defs/__schema20"}},"required":["document"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"image"},"data":{"type":"object","properties":{"assetId":{"$ref":"#/$defs/__schema0"},"alt":{"type":"string","maxLength":300},"caption":{"type":"string","maxLength":500}},"required":["assetId","alt"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"video"},"data":{"type":"object","properties":{"provider":{"type":"string","enum":["youtube","vimeo","rutube","direct","external"]},"url":{"$ref":"#/$defs/__schema22"},"title":{"$ref":"#/$defs/__schema3"}},"required":["provider","url","title"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"file"},"data":{"type":"object","properties":{"assetId":{"$ref":"#/$defs/__schema0"},"label":{"$ref":"#/$defs/__schema3"}},"required":["assetId","label"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"link"},"data":{"type":"object","properties":{"url":{"$ref":"#/$defs/__schema22"},"label":{"$ref":"#/$defs/__schema3"}},"required":["url","label"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"quote"},"data":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":4000},"author":{"type":"string","maxLength":180}},"required":["text","author"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"callout"},"data":{"type":"object","properties":{"text":{"type":"string","minLength":1,"maxLength":4000},"tone":{"type":"string","enum":["info","success","warning"]}},"required":["text","tone"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"divider"},"data":{"type":"object","properties":{},"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"code"},"data":{"type":"object","properties":{"code":{"type":"string","maxLength":20000},"language":{"type":"string","maxLength":30}},"required":["code","language"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false},{"type":"object","properties":{"id":{"$ref":"#/$defs/__schema0"},"version":{"$ref":"#/$defs/__schema19"},"type":{"type":"string","const":"gallery"},"data":{"type":"object","properties":{"items":{"minItems":1,"maxItems":12,"type":"array","items":{"$ref":"#/$defs/__schema23"}}},"required":["items"],"additionalProperties":false}},"required":["id","version","type","data"],"additionalProperties":false}]},"__schema19":{"type":"number","const":1},"__schema20":{"type":"object","properties":{"type":{"type":"string","enum":["doc","paragraph","text","heading","bulletList","orderedList","listItem","blockquote","codeBlock","hardBreak","horizontalRule"]},"text":{"type":"string","maxLength":20000},"attrs":{"type":"object","properties":{"level":{"type":"integer","minimum":1,"maximum":3},"start":{"type":"integer","minimum":1,"maximum":9999},"language":{"anyOf":[{"type":"string","maxLength":30},{"type":"null"}]}},"additionalProperties":false},"marks":{"maxItems":6,"type":"array","items":{"$ref":"#/$defs/__schema21"}},"content":{"maxItems":300,"type":"array","items":{"$ref":"#/$defs/__schema20"}}},"required":["type"],"additionalProperties":false},"__schema21":{"type":"object","properties":{"type":{"type":"string","enum":["bold","italic","strike","code","link","underline"]},"attrs":{"type":"object","properties":{"href":{"$ref":"#/$defs/__schema22"},"target":{"anyOf":[{"type":"string","const":"_blank"},{"type":"null"}]},"rel":{"anyOf":[{"type":"string","maxLength":80},{"type":"null"}]},"class":{"type":"null"}},"additionalProperties":false}},"required":["type"],"additionalProperties":false},"__schema22":{"type":"string","maxLength":2048},"__schema23":{"type":"object","properties":{"assetId":{"$ref":"#/$defs/__schema0"},"alt":{"type":"string","maxLength":300}},"required":["assetId","alt"],"additionalProperties":false}}}$schema$::json,doc) then raise exception 'INVALID_DOCUMENT';end if;
 return private.save_course_unvalidated(doc,expected_version);
end $$;
grant execute on function private.save_course(jsonb,integer) to authenticated;
create or replace function public.save_course(doc jsonb,expected_version integer) returns jsonb language sql security invoker set search_path='' as $$select private.save_course(doc,expected_version)$$;

alter function private.update_settings(jsonb) rename to update_settings_unvalidated;
revoke all on function private.update_settings_unvalidated(jsonb) from authenticated,anon,public;
create function private.update_settings(doc jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_staff(true);perform private.validate_semantics(doc,true);
 if not extensions.jsonb_matches_schema($schema${"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"brand_name":{"$ref":"#/$defs/__schema0"},"login_title":{"$ref":"#/$defs/__schema0"},"login_description":{"type":"string","maxLength":600},"support_email":{"type":"string","maxLength":254,"format":"email","pattern":"^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"},"footer_text":{"type":"string","maxLength":300},"seo_description":{"type":"string","maxLength":300},"accent_color":{"type":"string","pattern":"^#[0-9a-fA-F]{6}$"},"logo_asset_id":{"anyOf":[{"$ref":"#/$defs/__schema1"},{"type":"null"}]},"favicon_asset_id":{"anyOf":[{"$ref":"#/$defs/__schema1"},{"type":"null"}]},"content_watermark_enabled":{"type":"boolean"},"social_links":{"maxItems":6,"type":"array","items":{"$ref":"#/$defs/__schema2"}},"embed_origins":{"maxItems":10,"type":"array","items":{"$ref":"#/$defs/__schema3"}}},"required":["brand_name","login_title","login_description","support_email","footer_text","seo_description","accent_color","logo_asset_id","favicon_asset_id","content_watermark_enabled","social_links","embed_origins"],"additionalProperties":false,"$defs":{"__schema0":{"type":"string","minLength":1,"maxLength":180},"__schema1":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"__schema2":{"type":"object","properties":{"label":{"$ref":"#/$defs/__schema0"},"url":{"type":"string","maxLength":2048}},"required":["label","url"],"additionalProperties":false},"__schema3":{}}}$schema$::json,doc) then raise exception 'INVALID_SETTINGS';end if;
 return private.update_settings_unvalidated(doc);
end $$;
grant execute on function private.update_settings(jsonb) to authenticated;
create or replace function public.update_settings(doc jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.update_settings(doc)$$;
create or replace function public.catalog(q text default '',category uuid default null,tag text default '',sort text default 'recent',page integer default 1,staff boolean default false,saved boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; retry integer;
begin
 if not private.live_session() or (staff and not private.is_staff()) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if length(q)>200 or length(tag)>40 or page not between 1 and 10000 or sort not in ('recent','title','progress','featured','newest') then raise exception 'INVALID_QUERY'; end if;
 if q<>'' then retry:=private.user_limit('search'); if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if; end if;
 with available as (
 select c.id,c.slug,c.created_at,c.updated_at,c.published_revision_id is not null as published,c.draft_revision_id is not null as has_draft,
 r.id as revision_id,r.title,r.summary,r.author,r.cover_id,r.accent,r.featured,r.category_id,r.version,r.sequential,r.access_mode,
 cat.name as category_name,
 (select count(*)::int from public.lesson_revisions l where l.revision_id=r.id and (staff or l.published)) as lesson_count,
 (select count(*)::int from public.module_revisions m where m.revision_id=r.id) as module_count,
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
 paged as (select * from cards order by case when sort='featured' then featured end desc,case when sort='newest' then updated_at end desc,case when sort='title' then title end asc,case when sort='progress' then progress end desc,case when sort='recent' then coalesce(last_activity,updated_at) end desc,id limit 12 offset (page-1)*12)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from cards),'page',page,'pageSize',12) into result;
 return result;
end $$;

