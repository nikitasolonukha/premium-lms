alter table public.media add column variant_version integer not null default 0 check(variant_version in (0,1));
comment on column public.media.variant_version is '0: legacy .webp; 1: small/medium/large derivatives completed before marking ready';

-- Kept separate from the legacy operator-only finalize RPC for migration compatibility.
-- The server supplies the verified viewer session ID; the DB checks it again after
-- potentially slow file decoding/scanning. Ordinary users cannot call this RPC.
create function private.finalize_media_v2(mid uuid,owner uuid,sha text,session_id uuid,width integer default null,height integer default null,accepted boolean default true,variant_version integer default 0)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.media; changed boolean;
begin
 select * into item from public.media m where m.id=mid and m.owner_id=owner for update;
 if item.id is null or item.status<>'pending' then return false;end if;
 if variant_version not in (0,1) or (variant_version=1 and (item.mime_type not like 'image/%' or width is null or height is null or width not between 1 and 1800 or height not between 1 and 1800)) then raise exception 'INVALID_IMAGE';end if;
 if accepted then
  if not exists(select 1 from auth.sessions s join public.profiles p on p.id=s.user_id join auth.users u on u.id=s.user_id
   where s.id=finalize_media_v2.session_id and s.user_id=owner and p.disabled_at is null and u.email_confirmed_at is not null and (s.not_after is null or s.not_after>now())) then raise exception 'FORBIDDEN' using errcode='42501';end if;
  if item.purpose<>'avatar' and not exists(select 1 from private.admin_sessions a join public.user_roles r on r.user_id=a.user_id
   where a.session_id=finalize_media_v2.session_id and a.user_id=owner and a.revoked_at is null and a.started_at>now()-interval '12 hours' and a.last_active_at>now()-interval '30 minutes'
   and (r.role='admin' or (item.purpose='course' and r.role='editor'))
   and exists(select 1 from auth.mfa_factors f where f.user_id=owner and f.status='verified' and f.factor_type='totp')) then raise exception 'FORBIDDEN' using errcode='42501';end if;
 end if;
 changed:=private.finalize_media(mid,owner,sha,width,height,accepted);
 if changed and accepted then update public.media m set variant_version=finalize_media_v2.variant_version where m.id=mid;end if;
 return changed;
end $$;
create function public.finalize_media_v2(mid uuid,owner uuid,sha text,session_id uuid,width integer default null,height integer default null,accepted boolean default true,variant_version integer default 0)
returns boolean language sql security invoker set search_path='' as $$ select private.finalize_media_v2(mid,owner,sha,session_id,width,height,accepted,variant_version) $$;
revoke all on function private.finalize_media_v2(uuid,uuid,text,uuid,integer,integer,boolean,integer),public.finalize_media_v2(uuid,uuid,text,uuid,integer,integer,boolean,integer) from public,anon,authenticated,service_role;
grant execute on function private.finalize_media_v2(uuid,uuid,text,uuid,integer,integer,boolean,integer),public.finalize_media_v2(uuid,uuid,text,uuid,integer,integer,boolean,integer) to service_role;
