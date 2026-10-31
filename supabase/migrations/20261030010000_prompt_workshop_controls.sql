begin;
create table private.week7_app_rules(id integer primary key check(id=1),template text not null check(length(btrim(template)) between 1 and 10000),updated_at timestamptz not null default now(),check(position('{{current_time}}' in template)>0 and position('{{tag_slugs}}' in template)>0 and position('{{cover_catalog}}' in template)>0));
insert into private.week7_app_rules(id,template) values(1,$rules$You create practical, welcoming activities for Columbia College students. Audience: Sam, a junior from the Midwest, new to NYC, living in dorms, interested in exploring the city. Favor low cost and opportunities to make friends.
The current time is {{current_time}}. Suggest a suitable future start after the current time on any day of the week, based on the activity and user preferences. Do not limit activities to weekends or favor weekends by default. Respect explicit weekday or date preferences in the idea when compatible with a future start; weekday means Monday through Friday. Follow the selected format and area. When interest tags are supplied, choose tags only from that supplied list. Output starts_at as an ISO8601 timestamp including the America/New_York UTC offset.
Use an existing recognizable venue, or an online platform. Never infer an actual address from the uploaded image; use it only for theme and atmosphere. Do not claim reservations, availability or map verification. Prefer campus/Morningside Heights when appropriate. Prices are estimates. No room numbers.
Choose 1 to 3 tag slugs from: {{tag_slugs}}.
Select cover_id from this database catalog based on the activity (never invent an ID): {{cover_catalog}}.
Respond only as JSON with cover_id, title, description (activity and practical suggested steps), format (in_person or online), location (venue plus NYC neighborhood, or online platform), starts_at, duration_minutes (15..480), budget (USD/person 0..1000), capacity (2..200), tags.
An "any" preference or empty tags means no user restriction: choose the activity format, NYC area, or interests yourself.$rules$);
alter table private.week7_app_rules enable row level security;
revoke all on private.week7_app_rules from public,anon,authenticated;
create policy deny_clients on private.week7_app_rules for all to anon,authenticated using(false) with check(false);

create function private.week7_admin_app_rules() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.week6_assert_superadmin();
 return (select jsonb_build_object('template',r.template,'revision',md5(to_jsonb(r)::text)) from private.week7_app_rules r where id=1);
end$$;
create function private.week7_admin_set_app_rules(p_template text,p_revision text) returns jsonb language plpgsql security definer set search_path='' as $$declare before_row jsonb;begin
 perform private.week6_assert_superadmin();perform pg_advisory_xact_lock(729100);
 select to_jsonb(r) into before_row from private.week7_app_rules r where id=1 for update;
 if before_row is null or p_revision is distinct from md5(before_row::text) then raise exception 'App rules changed. Refresh before saving.';end if;
 if p_template is null or length(btrim(p_template)) not between 1 and 10000 or position('{{current_time}}' in p_template)=0 or position('{{tag_slugs}}' in p_template)=0 or position('{{cover_catalog}}' in p_template)=0 then raise exception 'Keep the current time, tag slugs and cover catalog variables. Rules must be up to 10000 characters.';end if;
 update private.week7_app_rules set template=btrim(p_template),updated_at=clock_timestamp() where id=1;
 return private.week7_admin_app_rules();
end$$;
create function private.week7_admin_create_chain(p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare cid bigint;begin
 perform private.week6_assert_superadmin();perform pg_advisory_xact_lock(729100);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name','description','instructions')) or jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'instructions') is distinct from 'string' or (p_payload ? 'description' and jsonb_typeof(p_payload->'description') is distinct from 'string') or length(btrim(p_payload->>'name')) not between 1 and 100 or length(btrim(p_payload->>'instructions')) not between 1 and 4000 or length(coalesce(p_payload->>'description',''))>1000 then raise exception 'Enter a chain name and generation instruction.';end if;
 insert into private.week7_chains(name,description) values(btrim(p_payload->>'name'),btrim(coalesce(p_payload->>'description',''))) returning id into cid;
 insert into private.week7_steps(chain_id,position,name,instructions) values(cid,1,'Generate activity',btrim(p_payload->>'instructions'));
 insert into private.week7_mix(chain_id,weight) values(cid,0);
 return jsonb_build_object('id',cid);
exception when unique_violation then raise exception 'A chain with that name already exists.';
end$$;

create or replace function private.week7_pipeline(p_gid bigint,p_proof text default null,p_source text default 'consumer') returns jsonb language plpgsql security definer set search_path='' as $$
declare chosen record;s record;global_model jsonb;config jsonb;rid bigint;g public.week4_ai_generations;begin
 perform private.week7_runtime_guard(p_proof);global_model:=private.week7_generation_model(p_proof);
 select * into g from public.week4_ai_generations where id=p_gid and user_id=auth.uid() and status='pending' for update;
 if not found then raise exception 'Generation unavailable';end if;
 if exists(select 1 from private.week7_requests where generation_id=p_gid and snapshot is not null) then raise exception 'Generation already started';end if;
 if p_source not in ('consumer','admin') then raise exception 'Invalid request source';end if;
 select x.* into chosen from private.week7_mix x where x.weight>0 and exists(select 1 from private.week7_steps st where st.chain_id=x.chain_id) order by -ln(greatest(random(),0.000000001))/x.weight limit 1;
 if not found then raise exception 'No active generation pipeline';end if;
 select st.id,st.instructions,(global_model->>'model_id')::bigint model_id,global_model->>'model' model,global_model->>'provider' provider,global_model->>'adapter' adapter,global_model->>'credential_env' credential_env into s from private.week7_steps st where st.chain_id=chosen.chain_id order by st.position limit 1;
 config:=to_jsonb(s)||jsonb_build_object('chain_id',chosen.chain_id,'app_rules',(select template from private.week7_app_rules where id=1),'terms',(select coalesce(jsonb_agg(jsonb_build_object('term',term,'definition',definition) order by id),'[]') from (select * from private.week7_terms where enabled order by id limit 30)t),'examples',(select coalesce(jsonb_agg(jsonb_build_object('input',input,'output',output) order by id),'[]') from (select * from private.week7_examples where enabled order by id limit 5)e));
 insert into private.week7_requests(generation_id,user_id,chain_id,source,status,snapshot) values(p_gid,auth.uid(),chosen.chain_id,p_source,'pending',config) on conflict(generation_id) do update set chain_id=excluded.chain_id,source=excluded.source,snapshot=excluded.snapshot returning id into rid;
 update public.week4_ai_generations set model=s.model where id=p_gid;
 return config||jsonb_build_object('request_id',rid);
end$$;

do $$declare f record;args text;begin
 for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) full_args,pg_get_function_result(p.oid) result,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('week7_admin_app_rules','week7_admin_set_app_rules','week7_admin_create_chain') loop
  execute format('revoke all on function private.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
  select coalesce(string_agg(quote_ident(x),','),'') into args from unnest(f.proargnames)x;
  execute format('create function public.%I(%s) returns %s language sql security invoker set search_path='''' as $wrap$select private.%I(%s)$wrap$',f.proname,f.full_args,f.result,f.proname,args);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
  execute format('grant execute on function private.%I(%s) to authenticated',f.proname,f.identity_args);
 end loop;
end$$;
commit;
