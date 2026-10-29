begin;
create function private.week7_admin_set_prompt_mix(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;current_row jsonb;begin
 perform private.week6_assert_superadmin();perform pg_advisory_xact_lock(729100);
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)<>(select count(*) from private.week7_mix) or jsonb_array_length(p_rows)>100 then raise exception 'Include every prompt version.';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r)<>'object' or jsonb_typeof(r->'id') is distinct from 'number' or jsonb_typeof(r->'weight') is distinct from 'number' or (r->>'id')!~'^[0-9]+$' or (r->>'weight')!~'^[0-9]+$' or (r->>'weight')::integer not between 0 and 100 or coalesce(r->>'revision','')!~'^[a-f0-9]{32}$') then raise exception 'Enter whole percentages from 0 to 100.';end if;
 if (select count(distinct r->>'id') from jsonb_array_elements(p_rows) r)<>jsonb_array_length(p_rows) or exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from private.week7_mix m where m.id=(r->>'id')::bigint)) then raise exception 'Prompt versions changed. Refresh before saving.';end if;
 if (select sum((r->>'weight')::integer) from jsonb_array_elements(p_rows) r)<>100 then raise exception 'Percentages must add up to 100.';end if;
 for item in select * from jsonb_array_elements(p_rows) loop
  select to_jsonb(m) into current_row from private.week7_mix m where m.id=(item->>'id')::bigint for update;
  if current_row is null or md5(current_row::text) is distinct from item->>'revision' then raise exception 'Prompt settings changed. Refresh before saving.';end if;
 end loop;
 update private.week7_mix m set weight=(r->>'weight')::integer from jsonb_array_elements(p_rows) r where m.id=(r->>'id')::bigint;
 return jsonb_build_object('ok',true);
exception when numeric_value_out_of_range or invalid_text_representation then raise exception 'Enter whole percentages from 0 to 100.';
end$$;
revoke all on function private.week7_admin_set_prompt_mix(jsonb) from public,anon,authenticated;
grant execute on function private.week7_admin_set_prompt_mix(jsonb) to authenticated;
create function public.week7_admin_set_prompt_mix(p_rows jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.week7_admin_set_prompt_mix(p_rows)$$;
revoke all on function public.week7_admin_set_prompt_mix(jsonb) from public,anon,authenticated;
grant execute on function public.week7_admin_set_prompt_mix(jsonb) to authenticated;
commit;
