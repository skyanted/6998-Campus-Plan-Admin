-- Assignment 4 only. Existing business tables and triggers remain unchanged.
create table public.week4_interest_tags (slug text primary key, label text not null check(char_length(label) between 1 and 20));
insert into public.week4_interest_tags values ('food','Food'),('arts','Arts'),('outdoors','Outdoors'),('sports','Sports'),('gaming','Gaming'),('music','Music'),('city','City'),('study','Study');
create table public.week4_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text check(char_length(first_name) between 1 and 100), last_name text check(char_length(last_name) between 1 and 100),
 email text check(email is null or (char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
 bio text not null default '' check(char_length(bio)<=2000), occupation text check(char_length(occupation)<=50), city text check(char_length(city)<=100),
 avatar_path text, published boolean not null default false, created_at timestamptz not null default now(),
 check(avatar_path is null or avatar_path like id::text || '/%'),
 check(not published or (first_name is not null and last_name is not null))
);
create table public.week4_member_interest_tags (user_id uuid references public.week4_profiles(id) on delete cascade,tag_slug text references public.week4_interest_tags(slug),primary key(user_id,tag_slug));
create table public.week4_rounds (id bigint generated always as identity primary key, closes_at timestamptz not null unique, settled_at timestamptz,winner_id bigint);
create table public.week4_ai_generations (
 id bigint generated always as identity primary key,user_id uuid not null references public.week4_profiles(id),
 round_id bigint references public.week4_rounds(id),inputs jsonb not null,prompt text not null check(char_length(prompt)<=20000),model text not null,
 image_path text,output jsonb,original_output jsonb,status text not null default 'pending' check(status in ('pending','ready','failed','discarded')),created_at timestamptz not null default now(),
 check(image_path is null or image_path like user_id::text || '/%')
);
create index week4_generations_owner_idx on public.week4_ai_generations(user_id,created_at desc);
create table public.week4_covers (
 id text primary key, description text not null, image_path text not null check(image_path ~ '^/week4-covers/[a-z]+[.]jpg$'), source_url text not null
);
alter table public.week4_covers enable row level security;
revoke all on public.week4_covers from anon,authenticated;
grant select on public.week4_covers to anon,authenticated;
create policy covers_read on public.week4_covers for select to anon,authenticated using(true);
insert into public.week4_covers(id,description,image_path,source_url) values
('outdoors','Friends hiking a green mountain trail with backpacks; choose for hiking, nature and outdoor adventures.','/week4-covers/outdoors.jpg','https://www.pexels.com/photo/a-group-of-friends-hiking-together-11724800/'),
('food','People sharing pizza slices around a table; choose for shared meals, casual dining and food gatherings.','/week4-covers/food.jpg','https://www.pexels.com/photo/people-sharing-a-pizza-9543813/'),
('arts','An overhead group painting and crafts workspace with watercolor materials; choose for drawing, painting or creative workshops.','/week4-covers/arts.jpg','https://www.pexels.com/photo/people-in-an-art-workshop-6146655/'),
('sports','People playing basketball on an outdoor court; choose for basketball and team sports.','/week4-covers/sports.jpg','https://www.pexels.com/photo/men-playing-basketball-on-open-court-2820903/'),
('gaming','Friends enjoying a social game together at a table; choose for board games, party games and game nights, including online game socials.','/week4-covers/gaming.jpg','https://www.pexels.com/photo/friends-playing-on-the-table-8111359/'),
('study','Students with books and laptops in a library; choose for studying, reading and learning groups.','/week4-covers/study.jpg','https://www.pexels.com/photo/students-studying-inside-the-library-8199659/'),
('music','Friends playing acoustic guitar outdoors; choose for music, singing and jam sessions.','/week4-covers/music.jpg','https://www.pexels.com/photo/friends-spending-time-together-with-guitar-3777729/'),
('city','A city skyline and a large urban park; choose for city walks, sightseeing and urban exploration.','/week4-covers/city.jpg','https://www.pexels.com/photo/aerial-photography-of-central-park-and-buildings-in-new-york-city-11317199/');
create table public.week4_events (
 id bigint generated always as identity primary key,creator_id uuid not null references public.week4_profiles(id),
 generation_id bigint not null unique references public.week4_ai_generations(id),round_id bigint references public.week4_rounds(id),
 title text not null check(char_length(title) between 1 and 120),description text not null check(char_length(description) between 1 and 5000),
 format text not null check(format in ('in_person','online')),place_id text,location text not null check(char_length(location) between 1 and 200),
 starts_at timestamptz not null,duration_minutes integer not null check(duration_minutes between 15 and 480),
 cover_id text references public.week4_covers(id),
 budget numeric(8,2) not null check(budget between 0 and 1000),capacity integer not null check(capacity between 2 and 200),image_path text,
 upvotes integer not null default 0 check(upvotes>=0),downvotes integer not null default 0 check(downvotes>=0),
 hosting_status text not null default 'undecided' check(hosting_status in ('undecided','confirmed','cancelled')),confirmed_at timestamptz,hosting_details text check(char_length(hosting_details)<=3000),published_at timestamptz not null default now()
);
alter table public.week4_rounds add constraint week4_round_winner_fk foreign key(winner_id) references public.week4_events(id);
create index week4_event_cover_idx on public.week4_events(cover_id);
create index week4_event_round_idx on public.week4_events(round_id);
create index week4_event_creator_idx on public.week4_events(creator_id);
create index week4_event_start_idx on public.week4_events(starts_at);
create table public.week4_event_tags(event_id bigint references public.week4_events(id) on delete cascade,tag_slug text references public.week4_interest_tags(slug),primary key(event_id,tag_slug));
create table public.week4_votes(event_id bigint references public.week4_events(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,value smallint not null check(value in (-1,1)),created_at timestamptz not null default now(),primary key(event_id,user_id));
create table public.week4_upvote_history(user_id uuid not null references auth.users(id) on delete cascade,event_id bigint not null references public.week4_events(id) on delete cascade,upvoted_at timestamptz not null default now(),primary key(user_id,event_id));
alter table public.week4_upvote_history enable row level security;
revoke all on public.week4_upvote_history from public,anon,authenticated;
grant select on public.week4_upvote_history to authenticated;
create policy history_read on public.week4_upvote_history for select to authenticated using(user_id=(select auth.uid()));
create index week4_member_tag_idx on public.week4_member_interest_tags(tag_slug);
create index week4_event_tag_idx on public.week4_event_tags(tag_slug);
create index week4_generation_round_idx on public.week4_ai_generations(round_id);
create index week4_vote_user_idx on public.week4_votes(user_id);

-- No table write grants: authenticated mutations use narrow transactional RPCs.
do $$ declare t text; begin foreach t in array array['week4_interest_tags','week4_profiles','week4_member_interest_tags','week4_rounds','week4_ai_generations','week4_events','week4_event_tags','week4_votes'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to anon,authenticated',t);
end loop; end $$;
create policy tags_read on public.week4_interest_tags for select to anon,authenticated using(true);
create policy profiles_read on public.week4_profiles for select to anon,authenticated using(published or id=(select auth.uid()));
create policy member_tags_read on public.week4_member_interest_tags for select to anon,authenticated using(exists(select 1 from public.week4_profiles p where p.id=user_id));
create policy rounds_read on public.week4_rounds for select to anon,authenticated using(true);
create policy generations_read on public.week4_ai_generations for select to authenticated using(user_id=(select auth.uid()));
create policy events_read on public.week4_events for select to anon,authenticated using(true);
create policy event_tags_read on public.week4_event_tags for select to anon,authenticated using(true);
create policy votes_read on public.week4_votes for select to authenticated using(user_id=(select auth.uid()));

create or replace function private.week4_profile_save(details jsonb,selected_tags text[]) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); begin
 if uid is null then raise exception 'Sign in first'; end if;
 if cardinality(selected_tags)>3 or cardinality(selected_tags)<>(select count(distinct x) from unnest(selected_tags) x) then raise exception 'Choose up to three different tags'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,4));
 insert into public.week4_profiles(id) values(uid) on conflict do nothing;
 if details is not null then
 update public.week4_profiles set first_name=nullif(btrim(details->>'first_name'),''),last_name=nullif(btrim(details->>'last_name'),''),email=nullif(btrim(details->>'email'),''),bio=coalesce(details->>'bio',''),occupation=nullif(btrim(details->>'occupation'),''),city=nullif(btrim(details->>'city'),''),avatar_path=nullif(details->>'avatar_path',''),published=true where id=uid;
 delete from public.week4_member_interest_tags where user_id=uid;
 insert into public.week4_member_interest_tags select uid,x from unnest(selected_tags) x;
 end if;
end; $$;
create or replace function private.week4_begin_generation(p_inputs jsonb,p_prompt text,p_model text,p_image text) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); gid bigint; begin
 if uid is null or not exists(select 1 from public.week4_profiles where id=uid and published) then raise exception 'Complete Profile first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,4));
 if (select count(*) from public.week4_ai_generations where user_id=uid and created_at>now()-interval '1 day')>=10 or exists(select 1 from public.week4_ai_generations where user_id=uid and created_at>now()-interval '30 seconds') then raise exception 'Generation limit reached. Try again later'; end if;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,image_path) values(uid,p_inputs,p_prompt,p_model,p_image) returning id into gid;
 return gid;
end; $$;
create table private.week4_generation_config(singleton boolean primary key default true check(singleton),secret_hash text not null);
alter table private.week4_generation_config enable row level security;
create policy week4_config_deny_clients on private.week4_generation_config for all to anon,authenticated using(false) with check(false);
revoke all on private.week4_generation_config from public,anon,authenticated;
create or replace function private.week4_finish_generation(gid bigint,result jsonb,original_result jsonb default null,generation_proof text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if generation_proof is null or not exists(select 1 from private.week4_generation_config where singleton and secret_hash=md5(generation_proof)) then raise exception 'Only the application can save AI output'; end if;
 update public.week4_ai_generations set output=result,original_output=coalesce(original_result,result),status=case when result is null then 'failed' else 'ready' end where id=gid and user_id=auth.uid() and status='pending';
 if not found then raise exception 'Generation unavailable'; end if;
end; $$;
create or replace function private.week4_publish(gid bigint,event_time timestamptz) returns bigint language plpgsql security definer set search_path='' as $$
declare g public.week4_ai_generations; eid bigint; begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,4));
 select * into g from public.week4_ai_generations where id=gid and user_id=auth.uid() and status='ready' for update;
 if not found then raise exception 'Generation unavailable'; end if;
 if event_time is null or event_time<=clock_timestamp() then raise exception 'Choose a future start time'; end if;
 if g.image_path is null and not exists(select 1 from public.week4_covers where id=g.output->>'cover_id') then raise exception 'AI must select a default cover'; end if;
 insert into public.week4_events(creator_id,generation_id,round_id,title,description,format,place_id,location,starts_at,duration_minutes,budget,capacity,cover_id,image_path)
 values(auth.uid(),gid,g.round_id,g.output->>'title',g.output->>'description',g.output->>'format',g.output->>'place_id',g.output->>'location',event_time,(g.output->>'duration_minutes')::integer,(g.output->>'budget')::numeric,(g.output->>'capacity')::integer,case when g.image_path is null then g.output->>'cover_id' else null end,g.image_path) returning id into eid;
 if jsonb_array_length(g.output->'tags')>3 then raise exception 'Too many tags'; end if;
 insert into public.week4_event_tags select eid,x from jsonb_array_elements_text(g.output->'tags') x;
 update public.week4_ai_generations d set status='discarded'
 where d.user_id=auth.uid() and d.id<>gid and d.status in ('pending','ready')
 and not exists(select 1 from public.week4_events e where e.generation_id=d.id);
 return eid;
end; $$;
create or replace function private.week4_vote(eid bigint,v integer) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); e public.week4_events; oldv integer:=0; begin
 if uid is null then raise exception 'Sign in to vote'; end if;
 if v not in (-1,0,1) or v is null then raise exception 'Invalid vote'; end if;
 select * into e from public.week4_events where id=eid for update;
 if not found then raise exception 'Event unavailable'; end if;
 if e.hosting_status='cancelled' or clock_timestamp()>=e.starts_at+make_interval(mins=>e.duration_minutes) then raise exception 'Voting has ended'; end if;
 select value into oldv from public.week4_votes where event_id=eid and user_id=uid;
 oldv:=coalesce(oldv,0);
 if v=0 then delete from public.week4_votes where event_id=eid and user_id=uid;
 else insert into public.week4_votes(event_id,user_id,value) values(eid,uid,v) on conflict(event_id,user_id) do update set value=excluded.value; end if;
 if v=1 then insert into public.week4_upvote_history(user_id,event_id) values(uid,eid) on conflict do nothing; end if;
 update public.week4_events set upvotes=upvotes+(case when v=1 then 1 else 0 end)-(case when oldv=1 then 1 else 0 end),downvotes=downvotes+(case when v=-1 then 1 else 0 end)-(case when oldv=-1 then 1 else 0 end) where id=eid;
end; $$;
create or replace function private.week4_set_hosting(eid bigint,decision text,details text) returns void language plpgsql security definer set search_path='' as $$
declare e public.week4_events; begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if decision not in ('confirmed','cancelled') or decision is null or details is null or char_length(details)>3000 or (decision='confirmed' and char_length(btrim(details))<1) then raise exception 'Choose a hosting decision and add details'; end if;
 select * into e from public.week4_events where id=eid and creator_id=auth.uid() for update;
 if not found then raise exception 'Only the organizer can decide hosting'; end if;
 if clock_timestamp()>=e.starts_at+make_interval(mins=>e.duration_minutes) then raise exception 'The activity has ended'; end if;
 update public.week4_events set hosting_status=decision,hosting_details=nullif(btrim(details),''),confirmed_at=case when decision='confirmed' then coalesce(confirmed_at,now()) else confirmed_at end where id=eid;
end; $$;
create or replace function private.week4_confirm(eid bigint,details text) returns void language sql security invoker set search_path='' as $$ select private.week4_set_hosting(eid,'confirmed',details); $$;
-- Exposed wrappers are INVOKER; definer logic is kept in the non-exposed private schema.
create function public.week4_profile_save(details jsonb default null,selected_tags text[] default '{}') returns void language sql security invoker set search_path='' as $$ select private.week4_profile_save(details,selected_tags); $$;
create function public.week4_begin_generation(p_inputs jsonb,p_prompt text,p_model text,p_image text default null) returns bigint language sql security invoker set search_path='' as $$ select private.week4_begin_generation(p_inputs,p_prompt,p_model,p_image); $$;
create function public.week4_finish_generation(gid bigint,result jsonb,original_result jsonb default null,generation_proof text default null) returns void language sql security invoker set search_path='' as $$ select private.week4_finish_generation(gid,result,original_result,generation_proof); $$;
create function public.week4_publish(gid bigint,event_time timestamptz) returns bigint language sql security invoker set search_path='' as $$ select private.week4_publish(gid,event_time); $$;
create function public.week4_vote(eid bigint,v integer) returns void language sql security invoker set search_path='' as $$ select private.week4_vote(eid,v); $$;
create function public.week4_confirm(eid bigint,details text) returns void language sql security invoker set search_path='' as $$ select private.week4_confirm(eid,details); $$;
create or replace function public.week4_set_hosting(eid bigint,decision text,details text default '') returns void language sql security invoker set search_path='' as $$ select private.week4_set_hosting(eid,decision,details); $$;
grant usage on schema private to authenticated;
do $$ declare f record; begin for f in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname like 'week4_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.sig::text not like '%week4_settle%' and f.sig::text not like '%week4_next_close%' then execute format('grant execute on function %s to authenticated',f.sig); end if;
end loop; end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('week4-avatars','week4-avatars',true,3145728,array['image/jpeg','image/png','image/webp']),
 ('week4-event-images','week4-event-images',false,3145728,array['image/jpeg','image/png','image/webp']);
create policy week4_image_upload on storage.objects for insert to authenticated with check(bucket_id in ('week4-avatars','week4-event-images') and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy week4_image_read on storage.objects for select to anon,authenticated using((bucket_id='week4-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text) or bucket_id='week4-event-images' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.week4_events e where e.image_path=name)));
-- Published cover files are immutable. Private abandoned uploads may be removed by their owner.
create policy week4_image_delete on storage.objects for delete to authenticated using(bucket_id in ('week4-avatars','week4-event-images') and (storage.foldername(name))[1]=(select auth.uid())::text and not exists(select 1 from public.week4_events e where e.image_path=name));
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' and tablename like 'week4_%' loop
 execute format('revoke all on public.%I from anon',t);
end loop; end $$;
alter policy covers_read on public.week4_covers to authenticated;
alter policy tags_read on public.week4_interest_tags to authenticated;
alter policy profiles_read on public.week4_profiles to authenticated;
alter policy member_tags_read on public.week4_member_interest_tags to authenticated;
alter policy rounds_read on public.week4_rounds to authenticated;
alter policy events_read on public.week4_events to authenticated;
alter policy event_tags_read on public.week4_event_tags to authenticated;
update storage.buckets set public=false where id='week4-avatars';
alter policy week4_image_read on storage.objects to authenticated using(
 (bucket_id='week4-avatars' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.week4_profiles p where p.published and p.avatar_path=name)))
 or (bucket_id='week4-event-images' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.week4_events e where e.image_path=name)))
);

-- Hosting is organizer-controlled; no weekly settlement job.

-- Week 4 discovery and deferred profile completion. No earlier assignment tables are altered.
begin;
create or replace function private.week4_begin_generation(p_inputs jsonb,p_prompt text,p_model text,p_image text) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); gid bigint; begin
 if uid is null then raise exception 'Sign in first'; end if;
 perform private.week4_profile_save(null,'{}'::text[]);
 perform pg_advisory_xact_lock(hashtextextended(uid::text,4));
 if (select count(*) from public.week4_ai_generations where user_id=uid and created_at>now()-interval '1 day')>=10 or exists(select 1 from public.week4_ai_generations where user_id=uid and created_at>now()-interval '30 seconds') then raise exception 'Generation limit reached. Try again later'; end if;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,image_path) values(uid,p_inputs,p_prompt,p_model,p_image) returning id into gid;
 return gid;
end; $$;
create or replace function private.week4_publish(gid bigint,event_time timestamptz) returns bigint language plpgsql security definer set search_path='' as $$
declare g public.week4_ai_generations; eid bigint; begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if not exists(select 1 from public.week4_profiles where id=auth.uid() and nullif(btrim(first_name),'') is not null and nullif(btrim(last_name),'') is not null) then raise exception 'Add your first and last name before publishing'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,4));
 select * into g from public.week4_ai_generations where id=gid and user_id=auth.uid() and status='ready' for update;
 if not found then raise exception 'Generation unavailable'; end if;
 if event_time is null or event_time<=clock_timestamp() then raise exception 'Choose a future start time'; end if;
 if g.image_path is null and not exists(select 1 from public.week4_covers where id=g.output->>'cover_id') then raise exception 'AI must select a default cover'; end if;
 insert into public.week4_events(creator_id,generation_id,round_id,title,description,format,place_id,location,starts_at,duration_minutes,budget,capacity,cover_id,image_path)
 values(auth.uid(),gid,g.round_id,g.output->>'title',g.output->>'description',g.output->>'format',g.output->>'place_id',g.output->>'location',event_time,(g.output->>'duration_minutes')::integer,(g.output->>'budget')::numeric,(g.output->>'capacity')::integer,case when g.image_path is null then g.output->>'cover_id' else null end,g.image_path) returning id into eid;
 if jsonb_array_length(g.output->'tags')>3 then raise exception 'Too many tags'; end if;
 insert into public.week4_event_tags select eid,x from jsonb_array_elements_text(g.output->'tags') x;
 update public.week4_ai_generations d set status='discarded'
 where d.user_id=auth.uid() and d.id<>gid and d.status in ('pending','ready')
 and not exists(select 1 from public.week4_events e where e.generation_id=d.id);
 return eid;
end; $$;
-- Public discovery exposes published activity fields and display names only.
-- Base tables, drafts, contact emails and personal vote records remain private.
create or replace function private.week4_public_feed() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by published_at desc),'[]'::jsonb) from (
  select e.published_at,jsonb_build_object(
   'id',e.id,'title',e.title,'description',e.description,'format',e.format,
   'place_id',e.place_id,'location',e.location,'starts_at',e.starts_at,
   'duration_minutes',e.duration_minutes,'budget',e.budget,'capacity',e.capacity,
   'upvotes',e.upvotes,'downvotes',e.downvotes,'hosting_status',e.hosting_status,
   'confirmed_at',e.confirmed_at,'hosting_details',e.hosting_details,'published_at',e.published_at,
   'imageUrl',case when e.image_path is not null then '/api/week4/image?bucket=week4-event-images&path='||e.image_path when e.cover_id is not null then '/api/week4/cover/'||e.cover_id else null end,
   'creator',coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Community member'),
   'tags',coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.week4_event_tags t where t.event_id=e.id),'[]'::jsonb)
  ) item
  from public.week4_events e join public.week4_profiles p on p.id=e.creator_id
 ) published;
$$;
create or replace function public.week4_public_feed() returns jsonb
language sql stable security invoker set search_path='' as $$ select private.week4_public_feed(); $$;
revoke all on function private.week4_public_feed(),public.week4_public_feed() from public,anon,authenticated;
grant usage on schema private to anon;
grant execute on function private.week4_public_feed(),public.week4_public_feed() to anon,authenticated;

-- A narrow predicate lets Storage serve published uploads without exposing drafts.
create or replace function private.week4_published_image(image_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.week4_events where image_path=image_name);
$$;
revoke all on function private.week4_published_image(text) from public,anon,authenticated;
grant execute on function private.week4_published_image(text) to anon,authenticated;
create index if not exists week4_public_image_idx on public.week4_events(image_path) where image_path is not null;
drop policy if exists week4_published_image_read on storage.objects;
create policy week4_published_image_read on storage.objects for select to anon
using(bucket_id='week4-event-images' and private.week4_published_image(name));
commit;

-- Read-only organizer profiles, reachable only through a published activity.
begin;
create or replace function private.week4_public_organizer(eid bigint) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'name',coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Community member'),
  'bio',p.bio,'occupation',p.occupation,'city',p.city,
  'avatarUrl',case when p.avatar_path is not null then '/api/week4/image?bucket=week4-avatars&path='||p.avatar_path else null end,
  'tags',coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.week4_member_interest_tags t where t.user_id=p.id),'[]'::jsonb)
 ) from public.week4_profiles p
 where p.published and exists(select 1 from public.week4_events e where e.id=eid and e.creator_id=p.id);
$$;
create or replace function public.week4_public_organizer(eid bigint) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.week4_public_organizer(eid); $$;
revoke all on function private.week4_public_organizer(bigint),public.week4_public_organizer(bigint) from public,anon,authenticated;
grant execute on function private.week4_public_organizer(bigint),public.week4_public_organizer(bigint) to anon,authenticated;

create or replace function private.week4_public_avatar(image_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.week4_profiles p where p.published and p.avatar_path=image_name
 and exists(select 1 from public.week4_events e where e.creator_id=p.id));
$$;
revoke all on function private.week4_public_avatar(text) from public,anon,authenticated;
grant execute on function private.week4_public_avatar(text) to anon,authenticated;
drop policy if exists week4_published_organizer_avatar on storage.objects;
create policy week4_published_organizer_avatar on storage.objects for select to anon
using(bucket_id='week4-avatars' and private.week4_public_avatar(name));
commit;

-- Week 4 generation limits: 20 attempts per rolling day, 10-second cooldown.
begin;
create or replace function private.week4_begin_generation(p_inputs jsonb,p_prompt text,p_model text,p_image text) returns bigint language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); gid bigint; begin
 if uid is null then raise exception 'Sign in first'; end if;
 perform private.week4_profile_save(null,'{}'::text[]);
 perform pg_advisory_xact_lock(hashtextextended(uid::text,4));
 if (select count(*) from public.week4_ai_generations where user_id=uid and created_at>now()-interval '1 day')>=20 then
  raise exception 'Generation limit reached. You can generate up to 20 events in 24 hours. Try again later.';
 end if;
 if exists(select 1 from public.week4_ai_generations where user_id=uid and created_at>now()-interval '10 seconds') then
  raise exception 'Generation limit reached. Please wait at least 10 seconds between generations.';
 end if;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,image_path) values(uid,p_inputs,p_prompt,p_model,p_image) returning id into gid;
 return gid;
end; $$;
commit;

-- Public discovery is limited to card previews. Complete event plans require sign-in.
begin;
create or replace function private.week4_public_feed() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item order by published_at desc),'[]'::jsonb) from (
  select e.published_at,jsonb_build_object(
   'id',e.id,'title',e.title,'description',left(e.description,240)||case when char_length(e.description)>240 then '…' else '' end,'format',e.format,
   'location',case when e.format='online' then 'Online' else split_part(e.location,',',1) end,'starts_at',e.starts_at,
   'duration_minutes',e.duration_minutes,
   'upvotes',e.upvotes,'downvotes',e.downvotes,'hosting_status',e.hosting_status,
   'published_at',e.published_at,
   'imageUrl',case when e.image_path is not null then '/api/week4/image?bucket=week4-event-images&path='||e.image_path when e.cover_id is not null then '/api/week4/cover/'||e.cover_id else null end,
   'creator',coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Community member'),
   'tags',coalesce((select jsonb_agg(t.tag_slug order by t.tag_slug) from public.week4_event_tags t where t.event_id=e.id),'[]'::jsonb)
  ) item
  from public.week4_events e join public.week4_profiles p on p.id=e.creator_id
 ) published;
$$;
commit;
