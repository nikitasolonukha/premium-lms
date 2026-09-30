begin;
create or replace function private.worker_api(op text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
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
 elsif op='report.recipient' then
  recipient:=(payload->>'recipient')::uuid;
  if j.kind<>'report' or not (j.payload->'recipients' @> jsonb_build_array(recipient)) then raise exception 'INVALID_RECIPIENT';end if;
  select jsonb_build_object('id',t.id,'chat_id',t.chat_id) into result from private.telegram_connections t where t.id=recipient and t.enabled and private.active_operator(t.owner_id);
  if result is null then raise exception 'INVALID_RECIPIENT';end if;
  return result;
 elsif op='report.receipt' then
  recipient:=(payload->>'recipient')::uuid;
  if j.kind<>'report' or not (j.payload->'recipients' @> jsonb_build_array(recipient)) then raise exception 'INVALID_RECIPIENT';end if;
  update private.operations_jobs set result=jsonb_set(private.operations_jobs.result,'{delivered}',coalesce(private.operations_jobs.result->'delivered','[]')||jsonb_build_array(recipient)),heartbeat_at=now() where id=j.id and not coalesce(private.operations_jobs.result->'delivered','[]') @> jsonb_build_array(recipient);
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
  update private.operations_jobs set result=jsonb_set(private.operations_jobs.result,array[n::text],jsonb_build_object('number',n+1,'status','done','user_id',target,'created',(payload->>'created')::boolean)),heartbeat_at=now(),progress=least(99,((n+1)*100/jsonb_array_length(j.payload->'rows'))) where id=j.id;
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
  update private.operations_jobs set status=case when (payload->>'success')::boolean then 'succeeded' else 'failed' end,error_code=payload->>'error',progress=case when (payload->>'success')::boolean then 100 else progress end,result=case when j.kind='import' then private.operations_jobs.result else private.operations_jobs.result||coalesce(payload->'result','{}') end,updated_at=now(),lease=null where id=j.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'UNKNOWN_WORKER_OPERATION';
end $$;





commit;
