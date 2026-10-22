-- Run separately, only when ready to enable live admin access.
-- This does not grant access based on the editable contact email in week4_profiles.
do $$ declare uid uuid;n integer;begin
 select count(*) into n from auth.users u where lower(u.email)='your-admin-google@example.com' and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 if n<>1 then raise exception 'Expected exactly one existing Google account. Sign in to Campus Plans first and verify the identity.';end if;
 select u.id into uid from auth.users u where lower(u.email)='your-admin-google@example.com' and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google');
 insert into private.week6_admin_access(user_id,is_superadmin) values(uid,true) on conflict(user_id) do update set is_superadmin=true;
end $$;
