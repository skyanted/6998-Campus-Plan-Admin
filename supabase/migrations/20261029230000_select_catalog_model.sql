begin;
create function private.week7_admin_use_model(p_model bigint,p_model_revision text,p_provider_revision text,p_revision text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m private.week7_models;p private.week7_providers;begin
 perform private.week6_assert_superadmin();perform pg_advisory_xact_lock(729100);
 if p_revision is distinct from private.week7_model_revision() then raise exception 'Model settings changed. Refresh before switching.';end if;
 select * into m from private.week7_models where id=p_model for update;
 if not found or md5(to_jsonb(m)::text) is distinct from p_model_revision then raise exception 'Model changed. Refresh before switching.';end if;
 select * into p from private.week7_providers where id=m.provider_id for update;
 if not found or md5(to_jsonb(p)::text) is distinct from p_provider_revision then raise exception 'Provider changed. Refresh before switching.';end if;
 if not m.enabled or not p.enabled or p.adapter<>'gemini' then raise exception 'Choose an available Google model.';end if;
 update private.week7_generation_settings set model_id=m.id,updated_at=clock_timestamp() where id=1;
 return private.week7_admin_global_model();
end$$;
revoke all on function private.week7_admin_use_model(bigint,text,text,text) from public,anon,authenticated;
grant execute on function private.week7_admin_use_model(bigint,text,text,text) to authenticated;
create function public.week7_admin_use_model(p_model bigint,p_model_revision text,p_provider_revision text,p_revision text) returns jsonb language sql security invoker set search_path='' as $$select private.week7_admin_use_model(p_model,p_model_revision,p_provider_revision,p_revision)$$;
revoke all on function public.week7_admin_use_model(bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.week7_admin_use_model(bigint,text,text,text) to authenticated;
commit;
