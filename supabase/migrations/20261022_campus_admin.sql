-- Additive Week 6 migration. Does not ALTER week4 tables, replace week4 functions,
-- change existing policies, seed admin access, or modify existing business rows.
begin;
create table private.week6_admin_access(user_id uuid primary key references auth.users(id) on delete cascade,is_superadmin boolean not null default false,created_at timestamptz not null default now());
create table private.week6_admin_log(id bigint generated always as identity primary key,actor_id uuid not null,action text not null,generation_id bigint not null,title text not null,reason text not null default '',created_at timestamptz not null default now());
create table private.week6_storage_cleanup(id bigint generated always as identity primary key,bucket text not null check(bucket='week4-event-images'),path text not null,completed_at timestamptz,created_at timestamptz not null default now(),unique(bucket,path));
alter table private.week6_admin_access enable row level security;
alter table private.week6_admin_log enable row level security;
alter table private.week6_storage_cleanup enable row level security;
revoke all on private.week6_admin_access,private.week6_admin_log,private.week6_storage_cleanup from public,anon,authenticated;

create function private.week6_is_superadmin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and exists(select 1 from private.week6_admin_access a where a.user_id=auth.uid() and a.is_superadmin)
 and exists(select 1 from auth.identities i where i.user_id=auth.uid() and i.provider='google')
 and exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) x where x->>'method'='oauth');
$$;
-- Google is the project's only enabled social provider. If that changes, audit
-- the verified session's provider before enabling another provider for admins.
create function private.week6_assert_superadmin() returns void language plpgsql stable security definer set search_path='' as $$ begin
 if not private.week6_is_superadmin() then raise exception 'Google superadmin access required' using errcode='42501'; end if;
end; $$;
create function public.week6_admin_me() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('authorized',private.week6_is_superadmin(),'name',case when private.week6_is_superadmin() then (select concat_ws(' ',first_name,last_name) from public.week4_profiles where id=auth.uid()) else null end);
$$;
create function private.week6_revision(gid bigint) returns text language sql stable security definer set search_path='' as $$
 select md5(((to_jsonb(g)||coalesce(to_jsonb(e),'{}'::jsonb))-'upvotes'-'downvotes')::text)
 from public.week4_ai_generations g left join public.week4_events e on e.generation_id=g.id where g.id=gid;
$$;
create function public.week6_admin_data() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform private.week6_assert_superadmin();
 if (select count(*) from public.week4_ai_generations)>2000 or (select count(*) from public.week4_profiles)>2000 or (select count(*) from public.week4_votes)>5000 then raise exception 'This version supports up to 2,000 profiles/generations and 5,000 votes. Add server pagination before continuing.'; end if;
 return jsonb_build_object(
 'profiles',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('tags',coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.week4_member_interest_tags t where t.user_id=p.id),'[]'::jsonb)) order by p.created_at desc),'[]'::jsonb) from public.week4_profiles p),
 'generations',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('revision',private.week6_revision(g.id)) order by g.created_at desc),'[]'::jsonb) from public.week4_ai_generations g),
 'events',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('tags',coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.week4_event_tags t where t.event_id=e.id),'[]'::jsonb)) order by e.published_at desc),'[]'::jsonb) from public.week4_events e),
 'votes',(select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at desc),'[]'::jsonb) from public.week4_votes v),
 'history',(select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from public.week4_upvote_history h),
 'logs',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id desc),'[]'::jsonb) from (select * from private.week6_admin_log order by id desc limit 250) l),
 'stats',jsonb_build_object('users',(select count(*) from public.week4_profiles),'published',(select count(*) from public.week4_events),'generations',(select count(*) from public.week4_ai_generations),'votes',(select count(*) from public.week4_votes)),
 'cleanup_count',(select count(*) from private.week6_storage_cleanup where completed_at is null));
end; $$;
create function private.week6_validate_plan(p jsonb) returns void language plpgsql stable security definer set search_path='' as $$ begin
 if p is null or jsonb_typeof(p)<>'object' then raise exception 'An event plan is required'; end if;
 if coalesce(char_length(btrim(p->>'title')),0) not between 1 and 120 or coalesce(char_length(btrim(p->>'description')),0) not between 1 and 5000 or coalesce(char_length(btrim(p->>'location')),0) not between 1 and 200 then raise exception 'Check title, description and location'; end if;
 if p->>'format' is null or p->>'format' not in ('online','in_person') or (p->>'duration_minutes')::integer not between 15 and 480 or (p->>'capacity')::integer not between 2 and 200 or (p->>'budget')::numeric not between 0 and 1000 then raise exception 'Check event format, duration, budget and capacity'; end if;
 if p->>'duration_minutes' is null or p->>'capacity' is null or p->>'budget' is null or p->>'starts_at' is null then raise exception 'Complete the event fields'; end if;
 perform (p->>'starts_at')::timestamptz;
 if jsonb_typeof(p->'tags') is distinct from 'array' then raise exception 'Choose valid interests'; end if;
 if jsonb_array_length(p->'tags')>3 or (select count(*)<>count(distinct x) from jsonb_array_elements_text(p->'tags') x) or exists(select 1 from jsonb_array_elements_text(p->'tags') x where not exists(select 1 from public.week4_interest_tags t where t.slug=x)) then raise exception 'Choose up to three different interests'; end if;
 if nullif(p->>'cover_id','') is not null and not exists(select 1 from public.week4_covers where id=p->>'cover_id') then raise exception 'Choose a valid cover'; end if;
end; $$;
create function public.week6_admin_command(p_action text,p_gid bigint,p_payload jsonb default null,p_expected text default '',p_reason text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.week4_ai_generations;e public.week4_events;eid bigint;uid uuid;ttl text;paths text[]; begin
 perform private.week6_assert_superadmin();
 if p_action is null or p_action not in ('update','publish','delete','cancel') then raise exception 'Invalid action'; end if;
 if p_reason is null or char_length(p_reason)>500 or (p_action in ('delete','cancel') and char_length(btrim(p_reason))<1) then raise exception 'Add a reason, up to 500 characters'; end if;
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
   if (p_payload->>'starts_at')::timestamptz<>e.starts_at then raise exception 'Published event times cannot be changed'; end if;
   update public.week4_events set title=btrim(p_payload->>'title'),description=btrim(p_payload->>'description'),format=p_payload->>'format',location=btrim(p_payload->>'location'),place_id=case when p_payload->>'location'=e.location and p_payload->>'format'=e.format then e.place_id else null end,duration_minutes=(p_payload->>'duration_minutes')::integer,budget=(p_payload->>'budget')::numeric,capacity=(p_payload->>'capacity')::integer,cover_id=case when nullif(p_payload->>'cover_id','') is not null then p_payload->>'cover_id' else e.cover_id end,image_path=case when nullif(p_payload->>'cover_id','') is not null then null else e.image_path end where id=e.id;
   delete from public.week4_event_tags where event_id=e.id;
   insert into public.week4_event_tags(event_id,tag_slug) select e.id,x from jsonb_array_elements_text(p_payload->'tags') x;
  else
   if (p_payload->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose a future start time'; end if;
   update public.week4_ai_generations set output=p_payload-'place_id'||case when p_payload->>'location'=g.output->>'location' and p_payload->>'format'=g.output->>'format' then jsonb_build_object('place_id',g.output->>'place_id') else '{}'::jsonb end,image_path=case when nullif(p_payload->>'cover_id','') is not null then null else image_path end where id=p_gid;
  end if;
 elsif p_action='publish' then
  if e.id is not null or g.user_id<>auth.uid() or g.status<>'ready' then raise exception 'Only your ready drafts can be published'; end if;
  perform private.week6_validate_plan(g.output);
  if not exists(select 1 from public.week4_profiles where id=auth.uid() and first_name is not null and last_name is not null) then raise exception 'Complete your name in Campus Plans before publishing'; end if;
  if (g.output->>'starts_at')::timestamptz<=clock_timestamp() then raise exception 'Choose a future start time'; end if;
  if g.image_path is null and nullif(g.output->>'cover_id','') is null then raise exception 'Choose a cover'; end if;
  insert into public.week4_events(creator_id,generation_id,title,description,format,location,place_id,starts_at,duration_minutes,budget,capacity,cover_id,image_path)
  values(g.user_id,g.id,g.output->>'title',g.output->>'description',g.output->>'format',g.output->>'location',g.output->>'place_id',(g.output->>'starts_at')::timestamptz,(g.output->>'duration_minutes')::integer,(g.output->>'budget')::numeric,(g.output->>'capacity')::integer,case when g.image_path is null then g.output->>'cover_id' else null end,g.image_path) returning id into eid;
  insert into public.week4_event_tags(event_id,tag_slug) select eid,x from jsonb_array_elements_text(g.output->'tags') x;
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
 insert into private.week6_admin_log(actor_id,action,generation_id,title,reason) values(auth.uid(),p_action,g.id,ttl,p_reason);
 return jsonb_build_object('ok',true,'event_id',coalesce(eid,e.id));
end; $$;

create function public.week6_admin_begin(p_inputs jsonb,p_prompt text,p_model text,p_image text default null) returns bigint language plpgsql security definer set search_path='' as $$ declare gid bigint; begin
 perform private.week6_assert_superadmin();
 if char_length(p_prompt)>20000 or char_length(p_model)>100 or p_model is null then raise exception 'Invalid generation request'; end if;
 if p_image is not null and p_image not like auth.uid()::text||'/%' then raise exception 'Invalid image path'; end if;
 gid:=private.week4_begin_generation(p_inputs,p_prompt,p_model,p_image);
 insert into private.week6_admin_log(actor_id,action,generation_id,title) values(auth.uid(),'generate',gid,'New event proposal');return gid;
end; $$;
create function public.week6_admin_finish(p_gid bigint,p_result jsonb,p_original jsonb default null) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.week6_assert_superadmin();
 if p_result is not null then perform private.week6_validate_plan(p_result); end if;
 update public.week4_ai_generations set output=p_result,original_output=coalesce(p_original,p_result),status=case when p_result is null then 'failed' else 'ready' end where id=p_gid and user_id=auth.uid() and status='pending';
 if not found then raise exception 'Generation unavailable'; end if;
end; $$;

create function private.week6_image_read(bucket text,image_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.week6_is_superadmin() and ((bucket='week4-avatars' and exists(select 1 from public.week4_profiles where avatar_path=image_path)) or (bucket='week4-event-images' and (exists(select 1 from public.week4_ai_generations g where g.image_path=$2) or exists(select 1 from public.week4_events e where e.image_path=$2))));
$$;
create function private.week6_image_delete(bucket text,image_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.week6_is_superadmin() and bucket='week4-event-images' and exists(select 1 from private.week6_storage_cleanup q where q.bucket=$1 and q.path=$2 and q.completed_at is null) and not exists(select 1 from public.week4_ai_generations where week4_ai_generations.image_path=$2) and not exists(select 1 from public.week4_events where week4_events.image_path=$2);
$$;
create policy week6_admin_images_read on storage.objects for select to authenticated using(private.week6_image_read(bucket_id,name) or private.week6_image_delete(bucket_id,name));
create policy week6_admin_images_delete on storage.objects for delete to authenticated using(private.week6_image_delete(bucket_id,name));
create function public.week6_admin_cleanup() returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 perform private.week6_assert_superadmin();return (select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,bucket,path from private.week6_storage_cleanup where completed_at is null and private.week6_image_delete(bucket,path) order by id limit 20) q);
end; $$;
create function public.week6_admin_cleanup_done(item_id bigint) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.week6_assert_superadmin();update private.week6_storage_cleanup set completed_at=now() where id=item_id and private.week6_image_delete(bucket,path);
end; $$;

-- Restrict only these NEW functions; never touch prior assignment grants.
do $$ declare f record;begin for f in select p.oid::regprocedure sig,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'week6_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.nspname='public' or f.proname in ('week6_image_read','week6_image_delete') then execute format('grant execute on function %s to authenticated',f.sig);end if;
end loop;end $$;
commit;
