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
 ), cards as (select *,case when lesson_count=0 then 0 else floor(least(completed_count,lesson_count)::numeric/lesson_count*100)::int end as progress from available),
 paged as (select * from cards order by case when sort='featured' then featured end desc,case when sort='newest' then updated_at end desc,case when sort='title' then title end asc,case when sort='progress' then progress end desc,case when sort='recent' then coalesce(last_activity,updated_at) end desc,id limit 12 offset (page-1)*12)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),'total',(select count(*) from cards),'page',page,'pageSize',12) into result;
 return result;
end $$;

