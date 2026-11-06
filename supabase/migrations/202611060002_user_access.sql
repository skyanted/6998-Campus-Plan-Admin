begin;
create table private.week8_access_log(id bigint generated always as identity primary key,actor_id uuid not null,user_id uuid not null,was_admin boolean not null,is_admin boolean not null,created_at timestamptz not null default now());
alter table private.week8_access_log enable row level security;
revoke all on private.week8_access_log from public,anon,authenticated;
create function public.week8_admin_set_user_access(p_user uuid,p_enabled boolean,p_expected boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous boolean;begin
 perform pg_advisory_xact_lock(806110);
 perform private.week6_assert_superadmin();
 if p_user is null or p_enabled is null or p_expected is null then raise exception 'Invalid permission change.';end if;
 if not exists(select 1 from public.week4_profiles where id=p_user) then raise exception 'User no longer exists.';end if;
 if p_user=auth.uid() and not p_enabled then raise exception 'You cannot remove your own admin access.';end if;
 if p_enabled and not exists(select 1 from auth.identities where user_id=p_user and provider='google') then raise exception 'This user must sign in with Google before receiving admin access.';end if;
 select coalesce((select is_superadmin from private.week6_admin_access where user_id=p_user),false) into previous;
 if previous is distinct from p_expected then raise exception 'Permissions changed. Refresh before trying again.';end if;
 insert into private.week6_admin_access(user_id,is_superadmin) values(p_user,p_enabled) on conflict(user_id) do update set is_superadmin=excluded.is_superadmin;
 if previous is distinct from p_enabled then insert into private.week8_access_log(actor_id,user_id,was_admin,is_admin) values(auth.uid(),p_user,previous,p_enabled);end if;
 return jsonb_build_object('ok',true);
end$$;
revoke all on function public.week8_admin_set_user_access(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.week8_admin_set_user_access(uuid,boolean,boolean) to authenticated;
commit;
