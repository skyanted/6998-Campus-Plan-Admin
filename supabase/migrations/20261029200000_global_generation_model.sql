begin;
create table private.week7_generation_settings(id integer primary key check(id=1),model_id bigint not null references private.week7_models on delete restrict,updated_at timestamptz not null default now());
insert into private.week7_generation_settings(id,model_id)
select 1,m.id from private.week7_models m join private.week7_providers p on p.id=m.provider_id where m.enabled and p.enabled
order by case when exists(select 1 from private.week7_mix x join private.week7_steps s on s.chain_id=x.chain_id where x.weight>0 and m.id=coalesce(x.model_id,s.model_id)) then 0 else 1 end,m.id limit 1;
alter table private.week7_generation_settings enable row level security;
revoke all on private.week7_generation_settings from public,anon,authenticated;
create policy deny_clients on private.week7_generation_settings for all to anon,authenticated using(false) with check(false);
-- Prompt chains control prompts only. Every chain uses the global model.
alter table private.week7_mix drop column model_id;
alter table private.week7_steps drop column model_id;

create function private.week7_model_revision() returns text language sql stable security definer set search_path='' as $$
 select md5((to_jsonb(s)||jsonb_build_object('model',to_jsonb(m),'provider',to_jsonb(p)))::text) from private.week7_generation_settings s join private.week7_models m on m.id=s.model_id join private.week7_providers p on p.id=m.provider_id where s.id=1;
$$;
create function private.week7_admin_global_model() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 perform private.week6_assert_superadmin();
 return (select jsonb_build_object('model_id',m.id,'provider_id',p.id,'identifier',m.identifier,'provider',p.name,'revision',private.week7_model_revision(),'updated_at',s.updated_at) from private.week7_generation_settings s join private.week7_models m on m.id=s.model_id join private.week7_providers p on p.id=m.provider_id where s.id=1);
end$$;
create function private.week7_generation_model(p_proof text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare config jsonb;begin
 perform private.week7_runtime_guard(p_proof);
 select jsonb_build_object('model_id',m.id,'model',m.identifier,'provider_id',p.id,'provider',p.name,'adapter',p.adapter,'credential_env',p.credential_env) into config from private.week7_generation_settings s join private.week7_models m on m.id=s.model_id join private.week7_providers p on p.id=m.provider_id where s.id=1 and m.enabled and p.enabled;
 if config is null then raise exception 'The global generation model is unavailable.';end if;return config;
end$$;
create function private.week7_admin_set_global_model(p_provider bigint,p_identifier text,p_revision text) returns jsonb language plpgsql security definer set search_path='' as $$declare selected_model bigint;v_identifier text:=btrim(p_identifier);begin
 perform private.week6_assert_superadmin();perform pg_advisory_xact_lock(729100);
 if p_revision is distinct from private.week7_model_revision() then raise exception 'Model settings changed. Refresh before saving.';end if;
 if v_identifier is null or v_identifier !~ '^[a-zA-Z0-9._-]{1,100}$' then raise exception 'Enter a valid model name, up to 100 characters.';end if;
 if not exists(select 1 from private.week7_providers where id=p_provider and enabled and adapter='gemini') then raise exception 'Choose an enabled Google provider.';end if;
 select id into selected_model from private.week7_models where provider_id=p_provider and week7_models.identifier=v_identifier;
 if selected_model is null then insert into private.week7_models(provider_id,name,identifier) values(p_provider,v_identifier,v_identifier) returning id into selected_model;
 elsif not (select enabled from private.week7_models where id=selected_model) then raise exception 'Enable this model before making it the global model.';end if;
 update private.week7_generation_settings set model_id=selected_model,updated_at=clock_timestamp() where id=1;
 return private.week7_admin_global_model();
end$$;
create function private.week7_protect_global_model() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_TABLE_NAME='week7_models' and exists(select 1 from private.week7_generation_settings where model_id=old.id) then
  if TG_OP='DELETE' then raise exception 'Choose another global model before deleting this model.';end if;
  if not new.enabled or not exists(select 1 from private.week7_providers where id=new.provider_id and enabled) then raise exception 'The global model and its provider must stay enabled.';end if;
 elsif TG_TABLE_NAME='week7_providers' and exists(select 1 from private.week7_generation_settings s join private.week7_models m on m.id=s.model_id where m.provider_id=old.id) then
  if TG_OP='DELETE' then raise exception 'Choose another global provider before deleting this provider.';end if;
  if not new.enabled then raise exception 'The global provider must stay enabled.';end if;
 end if;
 if TG_OP='DELETE' then return old;end if;return new;
end$$;
create trigger week7_protect_global_model before update or delete on private.week7_models for each row execute function private.week7_protect_global_model();
create trigger week7_protect_global_provider before update or delete on private.week7_providers for each row execute function private.week7_protect_global_model();

create or replace function private.week7_admin_save(p_section text,p_action text,p_id bigint default null,p_payload jsonb default '{}',p_revision text default '') returns jsonb language plpgsql security definer set search_path='' as $$
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
 when 'prompt-mix' then t:='mix';fields:=array['weight'];if p_action<>'update' then raise exception 'Prompt mix supports updates only';end if;
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
 if t='mix' and not exists(select 1 from private.week7_mix x where x.weight>0 and exists(select 1 from private.week7_steps s where s.chain_id=x.chain_id)) then raise exception 'Keep at least one prompt chain with a positive weight.';end if;
 return after_row;
exception when foreign_key_violation then raise exception 'This record is still used by a model, chain or prompt mix. Change those references first.';when unique_violation then raise exception 'That record already exists.';when check_violation or not_null_violation or invalid_text_representation then raise exception 'Check the required fields and allowed values.';
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
 config:=to_jsonb(s)||jsonb_build_object('chain_id',chosen.chain_id,'terms',(select coalesce(jsonb_agg(jsonb_build_object('term',term,'definition',definition) order by id),'[]') from (select * from private.week7_terms where enabled order by id limit 30)t),'examples',(select coalesce(jsonb_agg(jsonb_build_object('input',input,'output',output) order by id),'[]') from (select * from private.week7_examples where enabled order by id limit 5)e));
 insert into private.week7_requests(generation_id,user_id,chain_id,source,status,snapshot) values(p_gid,auth.uid(),chosen.chain_id,p_source,'pending',config) on conflict(generation_id) do update set chain_id=excluded.chain_id,source=excluded.source,snapshot=excluded.snapshot returning id into rid;
 update public.week4_ai_generations set model=s.model where id=p_gid;
 return config||jsonb_build_object('request_id',rid);
end$$;

do $$declare f record;args text;begin
 for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) full_args,pg_get_function_result(p.oid) result,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('week7_model_revision','week7_admin_global_model','week7_generation_model','week7_admin_set_global_model','week7_protect_global_model') loop
  execute format('revoke all on function private.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
  if f.proname in ('week7_admin_global_model','week7_generation_model','week7_admin_set_global_model') then
   select coalesce(string_agg(quote_ident(x),','),'') into args from unnest(f.proargnames)x;
   execute format('create function public.%I(%s) returns %s language sql security invoker set search_path='''' as $wrap$select private.%I(%s)$wrap$',f.proname,f.full_args,f.result,f.proname,args);
   execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
   execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
   execute format('grant execute on function private.%I(%s) to authenticated',f.proname,f.identity_args);
  end if;
 end loop;
end$$;
commit;
