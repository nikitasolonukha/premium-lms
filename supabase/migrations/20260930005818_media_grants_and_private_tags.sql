-- A download bearer grant was already authorized by the user-facing route.
-- Only the isolated signing service may resolve its file metadata.
create function private.download_asset(mid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('object_key',m.object_key,'filename',m.filename,'mime_type',m.mime_type)
 from public.media m where m.id=mid and m.status='ready'
$$;
create function public.download_asset(mid uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.download_asset(mid) $$;
revoke all on function private.download_asset(uuid),public.download_asset(uuid) from public,anon,authenticated;
grant execute on function private.download_asset(uuid),public.download_asset(uuid) to service_role;

drop policy tags_read on public.tags;
create policy tags_read on public.tags for select to authenticated using (
 private.live_session() and (private.is_staff() or exists (
  select 1 from public.revision_tags rt where rt.tag_id=tags.id and private.can_revision(rt.revision_id)
 ))
);

-- Match provider IDs at the database boundary as well as in Server Actions.
alter function private.validate_semantics(jsonb,boolean) rename to validate_semantics_base;
revoke all on function private.validate_semantics_base(jsonb,boolean) from public,anon,authenticated,service_role;
create function private.validate_semantics(doc jsonb,settings_doc boolean default false) returns void
language plpgsql stable set search_path='' as $$
declare module_doc jsonb;lesson_doc jsonb;block_doc jsonb;source text;provider text;clip text;
begin
 perform private.validate_semantics_base(doc,settings_doc);
 if settings_doc then return;end if;
 for module_doc in select value from jsonb_array_elements(doc->'modules') loop
  for lesson_doc in select value from jsonb_array_elements(module_doc->'lessons') loop
   for block_doc in select value from jsonb_array_elements(lesson_doc->'blocks') loop
    if block_doc->>'type'='video' then
     source:=block_doc->'data'->>'url';provider:=block_doc->'data'->>'provider';
     clip:=substring(rtrim(split_part(split_part(source,'?',1),'#',1),'/') from '/([^/]+)$');
     if provider='youtube' then clip:=coalesce(substring(source from '[?&]v=([^&#]+)'),clip);end if;
     if (provider='youtube' and coalesce(clip,'') !~ '^[A-Za-z0-9_-]{11}$')
       or (provider='vimeo' and coalesce(clip,'') !~ '^[0-9]{5,12}$')
       or (provider='rutube' and coalesce(clip,'') !~ '^[a-f0-9]{32}$') then
      raise exception 'INVALID_VIDEO';
     end if;
    end if;
   end loop;
  end loop;
 end loop;
end $$;
revoke all on function private.validate_semantics(jsonb,boolean) from public,anon,authenticated,service_role;
