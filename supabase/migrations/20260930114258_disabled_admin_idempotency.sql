-- Repeating disable does not remove an active Admin: the target is already inactive.
create or replace function private.set_user_disabled(target_user uuid,disabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare retry integer;
begin
 perform private.require_staff(true);
 retry:=private.user_limit('admin');
 if retry>0 then return jsonb_build_object('error','RATE_LIMIT','retryAfter',retry); end if;
 perform pg_advisory_xact_lock(77124001);
 if disabled
   and exists(select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=target_user and r.role='admin' and p.disabled_at is null)
   and (select count(*) from public.user_roles r join public.profiles p on p.id=r.user_id where r.role='admin' and p.disabled_at is null)<=1
 then raise exception 'LAST_ADMIN'; end if;
 update public.profiles set disabled_at=case when disabled then coalesce(disabled_at,now()) else null end,updated_at=now() where id=target_user;
 if disabled then delete from auth.sessions where user_id=target_user; end if;
 insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
 values(auth.uid(),'user.disable','user',target_user::text,jsonb_build_object('disabled',disabled));
 return jsonb_build_object('ok',true);
end $$;
