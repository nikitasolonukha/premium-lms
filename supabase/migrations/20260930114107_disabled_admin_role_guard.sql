-- A disabled Admin is not the active last Admin. Keep the existing serialization,
-- staff/AAL2 checks, rate counter, session revocation and trusted audit intact.
create or replace function private.set_role(target_user uuid,new_role text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_role text; retry integer;
begin
 perform private.require_staff(true);
 retry:=private.user_limit('admin');
 if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 if new_role not in ('student','editor','admin') then raise exception 'INVALID_ROLE'; end if;
 perform pg_advisory_xact_lock(77124001);
 select role into old_role from public.user_roles where user_id=target_user for update;
 if old_role='admin' and new_role<>'admin'
   and exists(select 1 from public.profiles p where p.id=target_user and p.disabled_at is null)
   and (select count(*) from public.user_roles r join public.profiles p on p.id=r.user_id where r.role='admin' and p.disabled_at is null)<=1
 then raise exception 'LAST_ADMIN'; end if;
 update public.user_roles set role=new_role,updated_at=now() where user_id=target_user;
 update private.admin_sessions set revoked_at=now() where user_id=target_user;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'user.role','user',target_user::text,jsonb_build_object('before',old_role,'after',new_role));
 return jsonb_build_object('ok',true);
end $$;
-- CREATE OR REPLACE preserves the pre-existing narrowly scoped EXECUTE grants.
