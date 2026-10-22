-- Keep privileged implementations outside the exposed API schema, following
-- the existing app's invoker-wrapper/definer-implementation architecture.
begin;
create policy week6_access_deny_clients on private.week6_admin_access for all to anon,authenticated using(false) with check(false);
create policy week6_log_deny_clients on private.week6_admin_log for all to anon,authenticated using(false) with check(false);
create policy week6_cleanup_deny_clients on private.week6_storage_cleanup for all to anon,authenticated using(false) with check(false);
do $$ declare f record;args text;begin
 for f in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) identity_args,pg_get_function_arguments(p.oid) full_args,pg_get_function_result(p.oid) result,p.proargnames from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('week6_admin_me','week6_admin_data','week6_admin_command','week6_admin_begin','week6_admin_finish','week6_admin_cleanup','week6_admin_cleanup_done') loop
  select coalesce(string_agg(quote_ident(x),','),'') into args from unnest(f.proargnames) x;
  execute format('alter function public.%I(%s) set schema private',f.proname,f.identity_args);
  execute format('revoke all on function private.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
  execute format('grant execute on function private.%I(%s) to authenticated',f.proname,f.identity_args);
  execute format('create function public.%I(%s) returns %s language sql security invoker set search_path='''' as $wrap$ select private.%I(%s); $wrap$',f.proname,f.full_args,f.result,f.proname,args);
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',f.proname,f.identity_args);
  execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
 end loop;
end $$;
commit;
