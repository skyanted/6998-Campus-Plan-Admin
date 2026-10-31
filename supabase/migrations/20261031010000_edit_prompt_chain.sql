begin;
create function private.week7_admin_update_chain(p_chain bigint,p_revision text,p_step bigint,p_step_revision text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare before_chain jsonb;before_step jsonb;begin
 perform private.week6_assert_superadmin();perform pg_advisory_xact_lock(729100);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('name','description','instructions')) or jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'instructions') is distinct from 'string' or (p_payload ? 'description' and jsonb_typeof(p_payload->'description') is distinct from 'string') or length(btrim(p_payload->>'name')) not between 1 and 100 or length(btrim(p_payload->>'instructions')) not between 1 and 4000 or length(coalesce(p_payload->>'description',''))>1000 then raise exception 'Enter a chain name and generation instruction.';end if;
 select to_jsonb(c) into before_chain from private.week7_chains c where id=p_chain for update;
 if before_chain is null then raise exception 'Chain no longer exists.';end if;
 if p_revision is distinct from md5(before_chain::text) then raise exception 'Chain changed. Refresh before saving.';end if;
 select to_jsonb(s) into before_step from private.week7_steps s where id=p_step and chain_id=p_chain for update;
 if before_step is null or (before_step->>'position')::integer is distinct from (select min(position) from private.week7_steps where chain_id=p_chain) then raise exception 'Generation step no longer matches this chain.';end if;
 if p_step_revision is distinct from md5(before_step::text) then raise exception 'Generation instruction changed. Refresh before saving.';end if;
 update private.week7_chains set name=btrim(p_payload->>'name'),description=btrim(coalesce(p_payload->>'description','')) where id=p_chain;
 update private.week7_steps set instructions=btrim(p_payload->>'instructions') where id=p_step;
 return jsonb_build_object('id',p_chain);
exception when unique_violation then raise exception 'A chain with that name already exists.';
end$$;
create function public.week7_admin_update_chain(p_chain bigint,p_revision text,p_step bigint,p_step_revision text,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.week7_admin_update_chain(p_chain,p_revision,p_step,p_step_revision,p_payload)$$;
revoke all on function private.week7_admin_update_chain(bigint,text,bigint,text,jsonb),public.week7_admin_update_chain(bigint,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function private.week7_admin_update_chain(bigint,text,bigint,text,jsonb),public.week7_admin_update_chain(bigint,text,bigint,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
