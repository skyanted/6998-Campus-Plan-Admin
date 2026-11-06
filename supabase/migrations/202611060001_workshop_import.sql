alter table private.week7_terms add column if not exists imported_chain_id bigint;
alter table private.week7_examples add column if not exists imported_chain_id bigint;
do $patch$ declare f record;def text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prokind='f' and (p.prosrc like '%private.week7_terms where enabled order%' or p.prosrc like '%private.week7_examples where enabled order%') loop
 def:=pg_get_functiondef(f.oid);def:=replace(def,'private.week7_terms where enabled order','private.week7_terms where enabled and imported_chain_id is null order');def:=replace(def,'private.week7_examples where enabled order','private.week7_examples where enabled and imported_chain_id is null order');execute def;
 end loop;
end $patch$;
begin;
create or replace function private.week7_admin_set_prompt_mix(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;current_row jsonb;begin
 perform private.week6_assert_superadmin();perform pg_advisory_xact_lock(729100);
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<>(select count(*) from private.week7_mix) or jsonb_array_length(p_rows)>100 then raise exception 'Include every prompt version.';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object' or jsonb_typeof(r->'id') is distinct from 'number' or jsonb_typeof(r->'weight') is distinct from 'number' or (r->>'id')!~'^[0-9]+$' or (r->>'weight')!~'^[0-9]+$' or (r->>'weight')::integer not between 0 and 10000 or coalesce(r->>'revision','')!~'^[a-f0-9]{32}$') then raise exception 'Enter whole weights from 0 to 10000.';end if;
 if (select count(distinct r->>'id') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows) or exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from private.week7_mix m where m.id=(r->>'id')::bigint)) then raise exception 'Prompt versions changed. Refresh before saving.';end if;
 if (select sum((r->>'weight')::integer) from jsonb_array_elements(p_rows) r)<=0 then raise exception 'Enable at least one chain.';end if;
 for item in select * from jsonb_array_elements(p_rows) loop
  select to_jsonb(m) into current_row from private.week7_mix m where m.id=(item->>'id')::bigint for update;
  if current_row is null or md5(current_row::text) is distinct from item->>'revision' then raise exception 'Prompt settings changed. Refresh before saving.';end if;
 end loop;
 update private.week7_mix m set weight=(r->>'weight')::integer from jsonb_array_elements(p_rows) r where m.id=(r->>'id')::bigint;
 return jsonb_build_object('ok',true);
exception when numeric_value_out_of_range or invalid_text_representation then raise exception 'Enter whole weights from 0 to 10000.';
end$$;
commit;

create or replace function private.studio_step_context(st private.week7_steps) returns jsonb language plpgsql stable security definer set search_path='' as $$declare sel jsonb:=st.context_selection;begin
 if sel is null or sel='null'::jsonb then return case when st.use_app_context then private.studio_context() else null end;end if;
 return jsonb_build_object('source','Shared','rules',coalesce((select string_agg(coalesce(sel->'rule_texts'->>(x->>'id'),x->>'text'),E'\n') from jsonb_array_elements(private.studio_rule_blocks()) x where sel->'rules' ? (x->>'id')),''),'rule_blocks',(select coalesce(jsonb_agg(x||jsonb_build_object('text',coalesce(sel->'rule_texts'->>(x->>'id'),x->>'text'))),'[]') from jsonb_array_elements(private.studio_rule_blocks()) x where sel->'rules' ? (x->>'id')),'terms',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'term',t.term,'definition',t.definition) order by t.id),'[]') from private.week7_terms t where t.enabled and sel->'terms' @> jsonb_build_array(t.id)),'examples',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'input',e.input,'output',e.output) order by e.id),'[]') from private.week7_examples e where e.enabled and sel->'examples' @> jsonb_build_array(e.id)),'covers',private.studio_context()->'covers');
end$$;
create or replace function public.studio_import_to_admin(p_chain bigint,p_revision text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.lab_chains; st private.lab_steps; cid bigint; nm text; suffix integer:=0; ctx jsonb; sel jsonb; blocks jsonb; x jsonb; tid bigint; eid bigint; termmap jsonb:='{}'; examplemap jsonb:='{}'; tids jsonb; eids jsonb; tn text; ruletexts jsonb;
begin
 perform private.week6_assert_superadmin();
 perform pg_advisory_xact_lock(729100);perform pg_advisory_xact_lock(830200);
 select * into c from private.lab_chains where id=p_chain;
 if c.id is null or private.lab_revision(c.id) is distinct from p_revision then raise exception 'Chain changed. Refresh before importing.';end if;
 if not exists(select 1 from private.lab_steps where chain_id=c.id) then raise exception 'Add a step before importing.';end if;
 nm:=c.name;
 while exists(select 1 from private.week7_chains where name=nm) loop suffix:=suffix+1;nm:=left(c.name,75)||' (imported '||suffix||')';end loop;
 insert into private.week7_chains(name,description) values(nm,c.description) returning id into cid;
 insert into private.week7_mix(chain_id,weight) values(cid,0);
 for st in select * from private.lab_steps where chain_id=c.id order by position loop
 ctx:=private.lab_step_context(st);tids:='[]';eids:='[]';
 for x in select * from jsonb_array_elements(coalesce(ctx->'terms','[]')) loop
 tid:=(termmap->>(x->>'term'))::bigint;
 if tid is null then
 tn:=x->>'term';suffix:=0;
 while exists(select 1 from private.week7_terms where term=tn) loop suffix:=suffix+1;tn:=left(x->>'term',100)||' (import '||cid||'-'||suffix||')';end loop;
 insert into private.week7_terms(term,definition,enabled,imported_chain_id) values(tn,x->>'definition',true,cid) returning id into tid;
 termmap:=termmap||jsonb_build_object(x->>'term',tid);
 end if;tids:=tids||jsonb_build_array(tid);
 end loop;
 for x in select * from jsonb_array_elements(coalesce(ctx->'examples','[]')) loop
 eid:=(examplemap->>md5(x::text))::bigint;
 if eid is null then
 insert into private.week7_examples(title,input,output,enabled,imported_chain_id) values(coalesce(x->>'title','Imported example'),x->>'input',x->'output',true,cid) returning id into eid;
 examplemap:=examplemap||jsonb_build_object(md5(x::text),eid);
 end if;eids:=eids||jsonb_build_array(eid);
 end loop;
 blocks:=coalesce(ctx->'rule_blocks',case when st.use_app_context then private.lab_rule_blocks() else '[]'::jsonb end);
 select coalesce(jsonb_object_agg(v->>'id',v->>'text'),'{}') into ruletexts from jsonb_array_elements(blocks) v;
 sel:=jsonb_build_object('rules',(select coalesce(jsonb_agg(v->>'id'),'[]') from jsonb_array_elements(blocks) v),'rule_texts',ruletexts,'terms',tids,'examples',eids);
 insert into private.week7_steps(chain_id,position,name,instructions,model_id,format,use_app_context,context_selection) values(cid,st.position,st.name,st.instructions,coalesce(st.model_id,(select model_id from private.lab_generation_settings where id=1)),st.format,st.use_app_context,sel);
 end loop;
 return jsonb_build_object('id',cid,'name',nm);
end$$;
revoke all on function public.studio_import_to_admin(bigint,text) from public,anon,authenticated;
grant execute on function public.studio_import_to_admin(bigint,text) to authenticated;
