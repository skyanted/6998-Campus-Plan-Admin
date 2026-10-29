begin;
create table private.week7_providers(id bigint generated always as identity primary key,name text not null unique check(length(btrim(name)) between 1 and 100),adapter text not null default 'gemini' check(adapter='gemini'),credential_env text not null default 'GEMINI_API_KEY' check(credential_env in ('GEMINI_API_KEY','GOOGLE_API_KEY')),enabled boolean not null default true,created_at timestamptz not null default now());
create table private.week7_models(id bigint generated always as identity primary key,provider_id bigint not null references private.week7_providers on delete restrict,name text not null check(length(btrim(name)) between 1 and 100),identifier text not null check(identifier ~ '^[a-zA-Z0-9._-]{1,100}$'),enabled boolean not null default true,created_at timestamptz not null default now(),unique(provider_id,identifier));
create table private.week7_chains(id bigint generated always as identity primary key,name text not null unique,description text not null);
create table private.week7_steps(id bigint generated always as identity primary key,chain_id bigint not null references private.week7_chains,position integer not null check(position>0),name text not null,instructions text not null,model_id bigint not null references private.week7_models on delete restrict,unique(chain_id,position));
create table private.week7_mix(id bigint generated always as identity primary key,chain_id bigint not null unique references private.week7_chains,model_id bigint references private.week7_models on delete restrict,weight integer not null check(weight between 0 and 10000));
create table private.week7_terms(id bigint generated always as identity primary key,term text not null unique check(length(btrim(term)) between 1 and 100),definition text not null check(length(btrim(definition)) between 1 and 2000),enabled boolean not null default true,created_at timestamptz not null default now());
create table private.week7_examples(id bigint generated always as identity primary key,title text not null check(length(btrim(title)) between 1 and 120),input text not null check(length(btrim(input)) between 1 and 2000),output jsonb not null check(jsonb_typeof(output)='object'),enabled boolean not null default true,created_at timestamptz not null default now());
create table private.week7_signup_domains(id bigint generated always as identity primary key,domain text not null unique check(domain=lower(domain) and domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' and domain not like '%..%'),enabled boolean not null default true,created_at timestamptz not null default now());
create table private.week7_whitelist(id bigint generated always as identity primary key,email text not null unique check(email=lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),enabled boolean not null default true,created_at timestamptz not null default now());
create table private.week7_signup_baseline(user_id uuid primary key references auth.users on delete cascade);
insert into private.week7_signup_baseline select id from auth.users;
create table private.week7_requests(id bigint generated always as identity primary key,generation_id bigint not null unique references public.week4_ai_generations on delete cascade,user_id uuid not null references auth.users on delete cascade,chain_id bigint references private.week7_chains,source text not null check(source in ('legacy','consumer','admin')),status text not null check(status in ('pending','ready','failed','discarded')),snapshot jsonb,error text,created_at timestamptz not null default now(),completed_at timestamptz);
create index on private.week7_requests(user_id,created_at desc);
create table private.week7_responses(id bigint generated always as identity primary key,request_id bigint not null references private.week7_requests on delete cascade,step_id bigint references private.week7_steps,model_id bigint references private.week7_models on delete set null,model text not null,provider text not null,prompt text,response_text text,response_json jsonb,raw_response jsonb,usage jsonb,latency_ms integer check(latency_ms>=0),http_status integer,error text,source text not null check(source in ('legacy','live')),created_at timestamptz not null default now());
create index on private.week7_responses(request_id);
create table private.week7_images(id bigint generated always as identity primary key,bucket text not null check(bucket in ('week4-event-images','week4-avatars','week7-admin-images')),path text not null check(length(path) between 1 and 250 and path not like '%..%'),label text not null check(length(btrim(label)) between 1 and 120),alt_text text not null default '' check(length(alt_text)<=500),created_by uuid references auth.users on delete set null,created_at timestamptz not null default now(),unique(bucket,path));

insert into private.week7_providers(name) values('Google AI');
insert into private.week7_models(provider_id,name,identifier) select id,'Gemini 3.5 Flash Lite','gemini-3.5-flash-lite' from private.week7_providers where name='Google AI';
insert into private.week7_chains(name,description) values('Campus Plans','Practical activities for Columbia students.'),('Campus Plans · Social','Activities designed around meeting new people.');
insert into private.week7_steps(chain_id,position,name,instructions,model_id) select c.id,1,'Generate activity',case when c.name='Campus Plans' then 'Create a practical activity following the supplied preferences and output schema.' else 'Prioritize activities where students can introduce themselves and participate together. Include a simple icebreaker in the description. Follow all supplied preferences and output constraints.' end,m.id from private.week7_chains c cross join private.week7_models m;
insert into private.week7_mix(chain_id,weight) select id,case when name='Campus Plans' then 100 else 0 end from private.week7_chains;
insert into private.week7_terms(term,definition) values('Morningside Heights','The Columbia campus neighborhood in Upper Manhattan. Favor nearby venues when the user selects the campus area.'),('Estimated budget','An approximate cost per person in USD; never claim a confirmed price or availability.');
insert into private.week7_signup_domains(domain) values('columbia.edu'),('barnard.edu');
insert into private.week7_whitelist(email) values('bradleyfang@gmail.com');
insert into private.week7_requests(generation_id,user_id,source,status,created_at) select id,user_id,'legacy',status,created_at from public.week4_ai_generations;
insert into private.week7_responses(request_id,model,provider,prompt,response_text,response_json,source) select r.id,g.model,'Not recorded',g.prompt,coalesce(g.original_output,g.output)::text,coalesce(g.original_output,g.output),'legacy' from private.week7_requests r join public.week4_ai_generations g on g.id=r.generation_id where coalesce(g.original_output,g.output) is not null;
insert into private.week7_images(bucket,path,label,created_by,created_at) select o.bucket_id,o.name,case when o.bucket_id='week4-avatars' then 'Profile photo' else 'Event inspiration' end,p.id,now() from storage.objects o left join public.week4_profiles p on split_part(o.name,'/',1)=p.id::text where o.bucket_id in ('week4-event-images','week4-avatars');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('week7-admin-images','week7-admin-images',false,3145728,array['image/jpeg','image/png','image/webp']);

create function private.week7_signup_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from private.week7_signup_baseline where user_id=auth.uid()) or exists(select 1 from private.week6_admin_access where user_id=auth.uid() and is_superadmin) or exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and (exists(select 1 from private.week7_whitelist w where w.enabled and w.email=lower(u.email)) or exists(select 1 from private.week7_signup_domains d where d.enabled and d.domain=lower(split_part(u.email,'@',2))))));
$$;
create function private.week7_profile_gate() returns trigger language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is not null and not private.week7_signup_allowed() then raise exception 'This email is not approved for Campus Plans.' using errcode='42501'; end if; return new;
end$$;
create trigger week7_signup_gate before insert on public.week4_profiles for each row execute function private.week7_profile_gate();

create function private.week7_runtime_guard(p_proof text) returns void language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not (private.week6_is_superadmin() or exists(select 1 from private.week4_generation_config where secret_hash=md5(coalesce(p_proof,'')))) then raise exception 'Verified generation server required' using errcode='42501'; end if;
end$$;
create function private.week7_image_used(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$ select case when p_bucket='week4-avatars' then exists(select 1 from public.week4_profiles where avatar_path=p_path) when p_bucket='week4-event-images' then exists(select 1 from public.week4_events where image_path=p_path) or exists(select 1 from public.week4_ai_generations where image_path=p_path and status in ('ready','pending')) else false end $$;

create function private.week7_admin_data(p_section text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t text;result jsonb;begin
 perform private.week6_assert_superadmin();
 if p_section='users' then return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'login_email',u.email,'last_sign_in_at',u.last_sign_in_at,'is_superadmin',coalesce(a.is_superadmin,false))),'[]') from public.week4_profiles p join auth.users u on u.id=p.id left join private.week6_admin_access a on a.user_id=p.id); end if;
 if p_section='images' then return (select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('revision',md5(to_jsonb(i)::text),'in_use',private.week7_image_used(i.bucket,i.path),'available',exists(select 1 from storage.objects o where o.bucket_id=i.bucket and o.name=i.path)) order by i.id desc),'[]') from private.week7_images i); end if;
 t:=case p_section when 'prompt-chains' then 'chains' when 'prompt-steps' then 'steps' when 'prompt-mix' then 'mix' when 'terms' then 'terms' when 'examples' then 'examples' when 'models' then 'models' when 'providers' then 'providers' when 'signup-domains' then 'signup_domains' when 'whitelisted-emails' then 'whitelist' when 'generation-requests' then 'requests' when 'llm-responses' then 'responses' end;
 if t is null then raise exception 'Unknown section';end if;
 execute format('select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object(''revision'',md5(to_jsonb(r)::text)) order by r.id desc),''[]''::jsonb) from (select * from private.%I order by id desc limit 2000)r','week7_'||t) into result;
 return result;
end$$;

create function private.week7_admin_save(p_section text,p_action text,p_id bigint default null,p_payload jsonb default '{}',p_revision text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare t text;fields text[];f text;columns_sql text;values_sql text;updates_sql text;before_row jsonb;after_row jsonb;defaults jsonb:='{}';clean jsonb;begin
 perform private.week6_assert_superadmin();perform pg_advisory_xact_lock(729100);
 if p_action not in ('create','update','delete') or p_action is null then raise exception 'Invalid action';end if;
 case p_section
 when 'terms' then t:='terms';fields:=array['term','definition','enabled'];defaults:='{"enabled":true}';
 when 'examples' then t:='examples';fields:=array['title','input','output','enabled'];defaults:='{"enabled":true}';
 when 'models' then t:='models';fields:=array['provider_id','name','identifier','enabled'];defaults:='{"enabled":true}';
 when 'providers' then t:='providers';fields:=array['name','adapter','credential_env','enabled'];defaults:='{"adapter":"gemini","credential_env":"GEMINI_API_KEY","enabled":true}';
 when 'signup-domains' then t:='signup_domains';fields:=array['domain','enabled'];defaults:='{"enabled":true}';
 when 'whitelisted-emails' then t:='whitelist';fields:=array['email','enabled'];defaults:='{"enabled":true}';
 when 'prompt-mix' then t:='mix';fields:=array['model_id','weight'];if p_action<>'update' then raise exception 'Prompt mix supports updates only';end if;
 when 'images' then t:='images';fields:=array['label','alt_text'];if p_action='create' then raise exception 'Upload an image first';end if;
 else raise exception 'This section is read only';end case;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(fields)) or length(p_payload::text)>30000 then raise exception 'Invalid fields';end if;
 if p_action<>'create' then
  execute format('select to_jsonb(t) from private.%I t where id=$1 for update','week7_'||t) into before_row using p_id;
  if before_row is null then raise exception 'Record no longer exists';end if;
  if p_revision is distinct from md5(before_row::text) then raise exception 'Record changed. Refresh before saving.';end if;
 end if;
 if p_action='delete' then
  if t='images' and private.week7_image_used(before_row->>'bucket',before_row->>'path') then raise exception 'This image is in use. Remove it from the event or profile first.';end if;
  execute format('delete from private.%I where id=$1','week7_'||t) using p_id;return before_row;
 end if;
 clean:=defaults||coalesce(before_row,'{}')||p_payload;
 if t='signup_domains' then clean:=clean||jsonb_build_object('domain',lower(btrim(clean->>'domain')));end if;
 if t='whitelist' then clean:=clean||jsonb_build_object('email',lower(btrim(clean->>'email')));end if;
 if t='examples' then perform private.week6_validate_plan(clean->'output');end if;
 foreach f in array fields loop
  columns_sql:=concat_ws(',',columns_sql,format('%I',f));values_sql:=concat_ws(',',values_sql,format('r.%I',f));updates_sql:=concat_ws(',',updates_sql,format('%I=r.%I',f,f));
 end loop;
 if p_action='create' then execute format('insert into private.%I(%s) select %s from jsonb_populate_record(null::private.%I,$1)r returning to_jsonb(%I.*)','week7_'||t,columns_sql,values_sql,'week7_'||t,'week7_'||t) into after_row using clean;
 else execute format('update private.%I t set %s from jsonb_populate_record(null::private.%I,$1)r where t.id=$2 returning to_jsonb(t.*)','week7_'||t,updates_sql,'week7_'||t) into after_row using clean,p_id;end if;
 if t in ('mix','models','providers') and not exists(select 1 from private.week7_mix x join private.week7_steps s on s.chain_id=x.chain_id join private.week7_models m on m.id=coalesce(x.model_id,s.model_id) join private.week7_providers p on p.id=m.provider_id where x.weight>0 and m.enabled and p.enabled) then raise exception 'Keep at least one active chain, model and provider with a positive weight.';end if;
 return after_row;
exception when foreign_key_violation then raise exception 'This record is still used by a model, chain or prompt mix. Change those references first.';when unique_violation then raise exception 'That record already exists.';when check_violation or not_null_violation or invalid_text_representation then raise exception 'Check the required fields and allowed values.';
end$$;

create function private.week7_pipeline(p_gid bigint,p_proof text default null,p_source text default 'consumer') returns jsonb language plpgsql security definer set search_path='' as $$
declare chosen record;s record;config jsonb;rid bigint;g public.week4_ai_generations;begin
 perform private.week7_runtime_guard(p_proof);
 select * into g from public.week4_ai_generations where id=p_gid and user_id=auth.uid() and status='pending' for update;
 if not found then raise exception 'Generation unavailable';end if;
 if exists(select 1 from private.week7_requests where generation_id=p_gid and snapshot is not null) then raise exception 'Generation already started';end if;
 if p_source not in ('consumer','admin') then raise exception 'Invalid request source';end if;
 select x.* into chosen from private.week7_mix x where x.weight>0 and exists(select 1 from private.week7_steps st join private.week7_models m on m.id=coalesce(x.model_id,st.model_id) join private.week7_providers p on p.id=m.provider_id where st.chain_id=x.chain_id and m.enabled and p.enabled) order by -ln(greatest(random(),0.000000001))/x.weight limit 1;
 if not found then raise exception 'No active generation pipeline';end if;
 select st.id,st.instructions,m.id model_id,m.identifier model,p.name provider,p.credential_env into s from private.week7_steps st join private.week7_models m on m.id=coalesce(chosen.model_id,st.model_id) join private.week7_providers p on p.id=m.provider_id where st.chain_id=chosen.chain_id order by st.position limit 1;
 config:=to_jsonb(s)||jsonb_build_object('chain_id',chosen.chain_id,'terms',(select coalesce(jsonb_agg(jsonb_build_object('term',term,'definition',definition) order by id),'[]') from (select * from private.week7_terms where enabled order by id limit 30)t),'examples',(select coalesce(jsonb_agg(jsonb_build_object('input',input,'output',output) order by id),'[]') from (select * from private.week7_examples where enabled order by id limit 5)e));
 insert into private.week7_requests(generation_id,user_id,chain_id,source,status,snapshot) values(p_gid,auth.uid(),chosen.chain_id,p_source,'pending',config) on conflict(generation_id) do update set chain_id=excluded.chain_id,source=excluded.source,snapshot=excluded.snapshot returning id into rid;
 update public.week4_ai_generations set model=s.model where id=p_gid;
 return config||jsonb_build_object('request_id',rid);
end$$;
create function private.week7_sync_generation() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='INSERT' then insert into private.week7_requests(generation_id,user_id,source,status,created_at) values(new.id,new.user_id,'legacy',new.status,new.created_at) on conflict(generation_id) do nothing;
 else update private.week7_requests set status=new.status,completed_at=case when new.status='pending' then null else coalesce(completed_at,now()) end where generation_id=new.id;end if;return new;
end$$;
create trigger week7_generation_insert after insert on public.week4_ai_generations for each row execute function private.week7_sync_generation();
create trigger week7_generation_update after update of status on public.week4_ai_generations for each row execute function private.week7_sync_generation();
create function private.week7_record_response(p_request bigint,p_response jsonb,p_proof text default null) returns void language plpgsql security definer set search_path='' as $$
declare r private.week7_requests;begin
 perform private.week7_runtime_guard(p_proof);
 select * into r from private.week7_requests where id=p_request and user_id=auth.uid() and snapshot is not null and status='pending' for update;
 if not found then raise exception 'Request unavailable';end if;
 if exists(select 1 from private.week7_responses where request_id=r.id) then raise exception 'Response already recorded';end if;
 if length(p_response::text)>1000000 or length(p_response->>'prompt')>20000 then raise exception 'Response too large';end if;
 insert into private.week7_responses(request_id,step_id,model_id,model,provider,prompt,response_text,response_json,raw_response,usage,latency_ms,http_status,error,source) values(r.id,(r.snapshot->>'id')::bigint,(r.snapshot->>'model_id')::bigint,r.snapshot->>'model',r.snapshot->>'provider',p_response->>'prompt',p_response->>'text',p_response->'json',p_response->'raw',p_response->'usage',(p_response->>'latency_ms')::integer,(p_response->>'http_status')::integer,left(p_response->>'error',1000),'live');
 update public.week4_ai_generations set prompt=p_response->>'prompt' where id=r.generation_id;
end$$;
create function private.week7_finish_request(p_gid bigint,p_error text default null,p_proof text default null) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.week7_runtime_guard(p_proof);
 update private.week7_requests r set status=g.status,error=left(p_error,1000),completed_at=now() from public.week4_ai_generations g where r.generation_id=g.id and g.id=p_gid and r.user_id=auth.uid() and g.status<>'pending';
end$$;
create function private.week7_register_image(p_bucket text,p_path text,p_label text) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform private.week6_assert_superadmin();
 if p_bucket not in ('week4-event-images','week4-avatars','week7-admin-images') or not exists(select 1 from storage.objects where bucket_id=p_bucket and name=p_path) then raise exception 'Image upload not found';end if;
 insert into private.week7_images(bucket,path,label,created_by) values(p_bucket,p_path,p_label,auth.uid()) on conflict(bucket,path) do nothing;
 select to_jsonb(i) into result from private.week7_images i where bucket=p_bucket and path=p_path;return result;
end$$;
-- Register uploads from the existing applications without changing their storage paths.
create function private.week7_track_image() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.bucket_id in ('week4-event-images','week4-avatars') then insert into private.week7_images(bucket,path,label,created_by) values(new.bucket_id,new.name,case when new.bucket_id='week4-avatars' then 'Profile photo' else 'Event inspiration' end,auth.uid()) on conflict(bucket,path) do nothing;end if;return new;
end$$;
create trigger week7_track_image after insert on storage.objects for each row execute function private.week7_track_image();
create function private.week7_can_read_image(b text,p text) returns boolean language sql stable security definer set search_path='' as $$select private.week6_is_superadmin() and exists(select 1 from private.week7_images where bucket=b and path=p)$$;
create function private.week7_can_delete_image(b text,p text) returns boolean language sql stable security definer set search_path='' as $$select private.week6_is_superadmin() and b in ('week4-event-images','week4-avatars','week7-admin-images') and not private.week7_image_used(b,p)$$;
create policy week7_read_image on storage.objects for select to authenticated using(private.week7_can_read_image(bucket_id,name));
create policy week7_upload_image on storage.objects for insert to authenticated with check(bucket_id='week7-admin-images' and private.week6_is_superadmin() and split_part(name,'/',1)=auth.uid()::text);
create policy week7_delete_image on storage.objects for delete to authenticated using(private.week7_can_delete_image(bucket_id,name));

do $$declare f record;args text;t record;begin
 for t in select tablename from pg_tables where schemaname='private' and tablename like 'week7_%' loop
 execute format('alter table private.%I enable row level security',t.tablename);
 execute format('revoke all on private.%I from public,anon,authenticated',t.tablename);
 execute format('create policy deny_clients on private.%I for all to anon,authenticated using(false) with check(false)',t.tablename);
 end loop;
 for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) full_args,pg_get_function_result(p.oid) result,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'week7_%' loop
 execute format('revoke all on function private.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
 if f.proname in ('week7_signup_allowed','week7_admin_data','week7_admin_save','week7_pipeline','week7_record_response','week7_finish_request','week7_register_image') then
  select coalesce(string_agg(quote_ident(x),','),'') into args from unnest(f.proargnames) x;
  execute format('create function public.%I(%s) returns %s language sql security invoker set search_path='''' as $wrap$select private.%I(%s)$wrap$',f.proname,f.full_args,f.result,f.proname,args);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
 end if;
 if f.proname not in ('week7_profile_gate','week7_track_image','week7_sync_generation','week7_runtime_guard','week7_image_used') then execute format('grant execute on function private.%I(%s) to authenticated',f.proname,f.identity_args);end if;
 end loop;
end$$;
commit;
