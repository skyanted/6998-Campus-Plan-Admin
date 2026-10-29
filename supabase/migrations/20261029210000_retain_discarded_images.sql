begin;
-- Publication still discards sibling drafts, but uploaded files remain attached to history.
create or replace function private.week6_admin_command(p_action text,p_gid bigint,p_payload jsonb default null,p_expected text default '',p_reason text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.week4_ai_generations;e public.week4_events;eid bigint;uid uuid;ttl text;paths text[]; begin
 perform private.week6_assert_superadmin();
 if p_action is null or p_action not in ('update','publish','delete','cancel','host') then raise exception 'Invalid action'; end if;
 if coalesce(char_length(p_reason),0)>500 then raise exception 'Action details must be 500 characters or fewer'; end if;
 select user_id into uid from public.week4_ai_generations where id=p_gid;
 if not found then raise exception 'Content no longer exists'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,4));
 select * into g from public.week4_ai_generations where id=p_gid for update;
 if not found then raise exception 'Content no longer exists'; end if;
 select * into e from public.week4_events where generation_id=p_gid for update;
 if p_expected is null or p_expected<>private.week6_revision(p_gid) then raise exception 'Content changed. Refresh before saving.'; end if;
 if g.status='pending' then raise exception 'Generation is still in progress'; end if;
 ttl:=coalesce(e.title,g.output->>'title','Generation');
 if p_action='update' then
  if g.status<>'ready' then raise exception 'Only ready proposals can be edited'; end if;
  perform private.week6_validate_plan(p_payload);
  if e.id is not null then
   update public.week4_events set starts_at=(p_payload->>'starts_at')::timestamptz,title=btrim(p_payload->>'title'),description=btrim(p_payload->>'description'),format=p_payload->>'format',location=btrim(p_payload->>'location'),place_id=case when p_payload->>'location'=e.location and p_payload->>'format'=e.format then e.place_id else null end,duration_minutes=(p_payload->>'duration_minutes')::integer,budget=(p_payload->>'budget')::numeric,capacity=(p_payload->>'capacity')::integer,cover_id=case when nullif(p_payload->>'cover_id','') is not null then p_payload->>'cover_id' else e.cover_id end,image_path=case when nullif(p_payload->>'cover_id','') is not null then null else e.image_path end where id=e.id;
   delete from public.week4_event_tags where event_id=e.id;
   insert into public.week4_event_tags(event_id,tag_slug) select e.id,x from jsonb_array_elements_text(p_payload->'tags') x;
  else
   update public.week4_ai_generations set output=p_payload-'place_id'||case when p_payload->>'location'=g.output->>'location' and p_payload->>'format'=g.output->>'format' then jsonb_build_object('place_id',g.output->>'place_id') else '{}'::jsonb end,image_path=case when nullif(p_payload->>'cover_id','') is not null then null else image_path end where id=p_gid;
  end if;
 elsif p_action='publish' then
  if e.id is not null or g.user_id<>auth.uid() or g.status<>'ready' then raise exception 'Only your ready drafts can be published'; end if;
  perform private.week6_validate_plan(g.output);
  -- Reuse the consumer app's exact publish transaction, including sibling drafts.
  eid:=private.week4_publish(g.id,(g.output->>'starts_at')::timestamptz);
  -- Discarding sibling drafts preserves their uploads for historical viewing.
 elsif p_action='host' then
  if e.id is null then raise exception 'Publish the event before confirming hosting'; end if;
  if jsonb_typeof(p_payload->'hosting_details') is distinct from 'string' or coalesce(char_length(btrim(p_payload->>'hosting_details')),0)<1 or char_length(p_payload->>'hosting_details')>3000 then raise exception 'Add hosting details, up to 3,000 characters'; end if;
  update public.week4_events set hosting_status='confirmed',hosting_details=btrim(p_payload->>'hosting_details'),confirmed_at=coalesce(confirmed_at,now()) where id=e.id;
 elsif p_action='cancel' then
  if e.id is null or e.starts_at+make_interval(mins=>e.duration_minutes)<=clock_timestamp() then raise exception 'Only events that have not ended can be cancelled'; end if;
  update public.week4_events set hosting_status='cancelled' where id=e.id;
 elsif p_action='delete' then
  paths:=array[g.image_path,e.image_path];
  if e.id is not null then
   update public.week4_rounds set winner_id=null where winner_id=e.id;
   delete from public.week4_events where id=e.id;
  end if;
  delete from public.week4_ai_generations where id=g.id;
  insert into private.week6_storage_cleanup(bucket,path) select 'week4-event-images',x from (select distinct unnest(paths) x) p where x is not null on conflict(bucket,path) do update set completed_at=null;
 end if;
 insert into private.week6_admin_log(actor_id,action,generation_id,title,reason) values(auth.uid(),p_action,g.id,ttl,coalesce(p_reason,''));
 return jsonb_build_object('ok',true,'event_id',coalesce(eid,e.id));
end; $$;
create or replace function private.week6_image_delete(bucket text,image_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.week6_is_superadmin() and bucket='week4-event-images'
 and exists(select 1 from private.week6_storage_cleanup q where q.bucket=$1 and q.path=$2 and q.completed_at is null)
 and not exists(select 1 from public.week4_ai_generations g where g.image_path=$2)
 and not exists(select 1 from public.week4_events e where e.image_path=$2);
$$;
create or replace function private.week7_image_used(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_bucket='week4-avatars' then exists(select 1 from public.week4_profiles where avatar_path=p_path)
 when p_bucket='week4-event-images' then exists(select 1 from public.week4_events where image_path=p_path)
 or exists(select 1 from public.week4_ai_generations where image_path=p_path and status in ('ready','pending','discarded')) else false end;
$$;
create function private.week7_discarded_image(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.week4_ai_generations where image_path=p_path and status='discarded');
$$;
revoke all on function private.week7_discarded_image(text) from public,anon,authenticated;
grant execute on function private.week7_discarded_image(text) to authenticated;
-- Also protect against an older deployed client still requesting discard cleanup.
create policy week7_preserve_discarded_uploads on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'week4-event-images' or not private.week7_discarded_image(name));
-- Use the existing authorized RPC inside the upload policy; its private role helper is not client-executable.
alter policy week7_upload_image on storage.objects with check(bucket_id='week7-admin-images' and (public.week6_admin_me()->>'authorized')::boolean and split_part(name,'/',1)=auth.uid()::text);
-- Permit an admin to read their new upload before its catalog entry is registered.
alter policy week7_read_image on storage.objects using(private.week7_can_read_image(bucket_id,name) or (bucket_id='week7-admin-images' and (public.week6_admin_me()->>'authorized')::boolean and split_part(name,'/',1)=auth.uid()::text));
-- Cancel old cleanup work for retained images. No image or generation rows are removed.
delete from private.week6_storage_cleanup q where q.bucket='week4-event-images' and exists(select 1 from public.week4_ai_generations g where g.image_path=q.path and g.status='discarded');
commit;
