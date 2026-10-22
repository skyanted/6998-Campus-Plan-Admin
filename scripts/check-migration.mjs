import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create schema storage;
create table auth.users(id uuid primary key);
create table auth.identities(user_id uuid,provider text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
await db.exec(readFileSync('tests/fixtures/week4-baseline.sql','utf8').split('create extension if not exists pg_cron')[0]);
const functions=()=>db.query("select p.proname,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname like 'week4_%' order by n.nspname,p.proname");
const before=JSON.stringify((await functions()).rows);
await db.exec(readFileSync('supabase/migrations/20261022_campus_admin.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261022_admin_rpc_wrappers.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261022193000_reuse_consumer_publish.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261022203000_allow_admin_reschedule.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261022210000_allow_admin_past_dates.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261022220000_admin_event_hosting.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261022230000_simplify_admin_confirmation.sql','utf8'));
if(JSON.stringify((await functions()).rows)!==before)throw Error('Existing Week 4 functions were changed');
// Isolated database only: verify publication and cleanup without touching real content.
await db.exec(`
do $$
declare
 owner_id uuid:='00000000-0000-4000-8000-000000000001';
 other_id uuid:='00000000-0000-4000-8000-000000000002';
 plan jsonb:=jsonb_build_object('title','Publish check','description','Local migration verification','format','online','location','Online','starts_at',now()+interval '2 days','duration_minutes',60,'budget',0,'capacity',10,'cover_id','study','tags',jsonb_build_array('study'));
 target bigint; sibling bigint; pending bigint; published bigint; other_draft bigint; failed bigint; published_event bigint; other_event bigint; historical_draft bigint; result jsonb; updated_plan jsonb;
begin
 insert into auth.users(id) values(owner_id),(other_id);
 insert into auth.identities(user_id,provider) values(owner_id,'google');
 insert into public.week4_profiles(id,first_name,last_name) values(owner_id,'Admin','Check'),(other_id,'Other','Check');
 insert into private.week6_admin_access(user_id,is_superadmin) values(owner_id,true);
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims','{"amr":[{"method":"oauth"}]}',true);
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,output,status) values(owner_id,'{}','test','test',plan,'ready') returning id into target;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,output,status,image_path) values(owner_id,'{}','test','test',plan,'ready',owner_id::text||'/discarded.jpg') returning id into sibling;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,status) values(owner_id,'{}','test','test','pending') returning id into pending;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,output,status,image_path) values(owner_id,'{}','test','test',plan,'ready',owner_id::text||'/published.jpg') returning id into published;
 insert into public.week4_events(creator_id,generation_id,title,description,format,location,starts_at,duration_minutes,budget,capacity,image_path) values(owner_id,published,'Existing event','Already published','online','Online',now()+interval '1 day',60,0,10,owner_id::text||'/published.jpg') returning id into published_event;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,output,status) values(other_id,'{}','test','test',plan,'ready') returning id into other_draft;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,status) values(owner_id,'{}','test','test','failed') returning id into failed;
 result:=public.week6_admin_command('publish',target,null,private.week6_revision(target),'');
 if (select status from public.week4_ai_generations where id=sibling)<>'discarded' or (select status from public.week4_ai_generations where id=pending)<>'discarded' then raise exception 'Sibling drafts were not discarded'; end if;
 if (select status from public.week4_ai_generations where id=other_draft)<>'ready' or (select status from public.week4_ai_generations where id=published)<>'ready' or (select status from public.week4_ai_generations where id=failed)<>'failed' then raise exception 'Unrelated content was changed'; end if;
 if not exists(select 1 from public.week4_events where id=(result->>'event_id')::bigint and generation_id=target and creator_id=owner_id and upvotes=0 and downvotes=0 and hosting_status='undecided') then raise exception 'Incorrect published event'; end if;
 if not exists(select 1 from public.week4_event_tags where event_id=(result->>'event_id')::bigint and tag_slug='study') then raise exception 'Missing event tags'; end if;
 if not private.week6_image_delete('week4-event-images',owner_id::text||'/discarded.jpg') then raise exception 'Discarded photo not eligible for cleanup'; end if;
 insert into private.week6_storage_cleanup(bucket,path) values('week4-event-images',owner_id::text||'/published.jpg');
 if private.week6_image_delete('week4-event-images',owner_id::text||'/published.jpg') then raise exception 'Published photo must remain protected'; end if;
 -- Verify cross-owner rescheduling preserves identity, votes and original AI output.
 insert into public.week4_events(creator_id,generation_id,title,description,format,location,starts_at,duration_minutes,budget,capacity,cover_id,upvotes) values(other_id,other_draft,'Other event','Needs a new date','online','Online',now()-interval '2 days',60,0,10,'study',1) returning id into other_event;
 insert into public.week4_votes(event_id,user_id,value) values(other_event,owner_id,1);
 updated_plan:=plan||jsonb_build_object('starts_at',now()+interval '3 days');
 perform public.week6_admin_command('update',other_draft,updated_plan,private.week6_revision(other_draft),'');
 if not exists(select 1 from public.week4_events where id=other_event and creator_id=other_id and starts_at=(updated_plan->>'starts_at')::timestamptz and upvotes=1) or not exists(select 1 from public.week4_votes where event_id=other_event and user_id=owner_id and value=1) or (select output from public.week4_ai_generations where id=other_draft)<>plan then raise exception 'Rescheduling damaged existing content'; end if;
 updated_plan:=updated_plan||jsonb_build_object('starts_at',now()-interval '1 day');
 perform public.week6_admin_command('update',other_draft,updated_plan,private.week6_revision(other_draft),'');
 if not exists(select 1 from public.week4_events where id=other_event and starts_at=(updated_plan->>'starts_at')::timestamptz and upvotes=1) then raise exception 'Historical date edit failed'; end if;
 insert into public.week4_ai_generations(user_id,inputs,prompt,model,output,status) values(owner_id,'{}','test','test',plan,'ready') returning id into historical_draft;
 perform public.week6_admin_command('update',historical_draft,updated_plan,private.week6_revision(historical_draft),'');
 if (select (output->>'starts_at')::timestamptz from public.week4_ai_generations where id=historical_draft)<>(updated_plan->>'starts_at')::timestamptz then raise exception 'Historical draft edit failed'; end if;
 begin
  perform public.week6_admin_command('publish',historical_draft,null,private.week6_revision(historical_draft),'');
  raise exception 'New past event was published';
 exception when others then
  if sqlerrm<>'Choose a future start time' then raise; end if;
 end;
 update public.week4_events set starts_at=now()-interval '2 days' where id=other_event;
 updated_plan:=plan||jsonb_build_object('starts_at',now()-interval '2 days','title','Corrected past event title');
 perform public.week6_admin_command('update',other_draft,updated_plan,private.week6_revision(other_draft),'');
 if not exists(select 1 from public.week4_events where id=other_event and title='Corrected past event title' and starts_at=(updated_plan->>'starts_at')::timestamptz) then raise exception 'Unchanged past date prevented a content correction'; end if;

 -- Hosting is a superadmin operation across organizers, including historical corrections.
 perform public.week6_admin_command('host',other_draft,jsonb_build_object('hosting_details','  Meet at the campus gates  '),private.week6_revision(other_draft),'');
 if not exists(select 1 from public.week4_events where id=other_event and creator_id=other_id and hosting_status='confirmed' and hosting_details='Meet at the campus gates' and confirmed_at is not null and upvotes=1) or not exists(select 1 from public.week4_votes where event_id=other_event and user_id=owner_id and value=1) then raise exception 'Hosting changed the organizer or votes'; end if;
 update public.week4_events set confirmed_at=now()-interval '1 hour' where id=other_event;
 perform public.week6_admin_command('host',other_draft,jsonb_build_object('hosting_details','Updated meeting point'),private.week6_revision(other_draft),'');
 if not exists(select 1 from public.week4_events where id=other_event and hosting_details='Updated meeting point' and confirmed_at=now()-interval '1 hour') then raise exception 'Hosting update reset the confirmation time'; end if;
 begin
  perform public.week6_admin_command('host',other_draft,jsonb_build_object('hosting_details','   '),private.week6_revision(other_draft),'');
  raise exception 'Empty hosting details were accepted';
 exception when others then
  if sqlerrm<>'Add hosting details, up to 3,000 characters' then raise; end if;
 end;
 begin
  perform public.week6_admin_command('host',historical_draft,jsonb_build_object('hosting_details','Draft cannot be hosted'),private.week6_revision(historical_draft),'');
  raise exception 'Unpublished draft was hosted';
 exception when others then
  if sqlerrm<>'Publish the event before confirming hosting' then raise; end if;
 end;
 begin
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  perform public.week6_admin_command('host',other_draft,jsonb_build_object('hosting_details','Unauthorized change'),private.week6_revision(other_draft),'');
  raise exception 'Non-admin hosting was allowed';
 exception when insufficient_privilege then null;
 end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 update public.week4_events set hosting_status='cancelled' where id=other_event;
 perform public.week6_admin_command('host',other_draft,jsonb_build_object('hosting_details','Restored event arrangements'),private.week6_revision(other_draft),'');
 if not exists(select 1 from public.week4_events where id=other_event and hosting_status='confirmed' and creator_id=other_id and upvotes=1) then raise exception 'Hosting restoration failed'; end if;

 -- Dialog confirmation is sufficient: cancellation/deletion accept an empty reason.
 perform public.week6_admin_command('cancel',published,null,private.week6_revision(published),'');
 if not exists(select 1 from public.week4_events where id=published_event and hosting_status='cancelled') or not exists(select 1 from public.week4_ai_generations where id=published) then raise exception 'Cancellation did not preserve content'; end if;
 insert into public.week4_upvote_history(user_id,event_id) values(owner_id,other_event);
 perform public.week6_admin_command('delete',other_draft,null,private.week6_revision(other_draft),'');
 if exists(select 1 from public.week4_events where id=other_event) or exists(select 1 from public.week4_ai_generations where id=other_draft) or exists(select 1 from public.week4_votes where event_id=other_event) or exists(select 1 from public.week4_event_tags where event_id=other_event) or exists(select 1 from public.week4_upvote_history where event_id=other_event) then raise exception 'Permanent deletion left related content'; end if;
 if not exists(select 1 from public.week4_profiles where id=other_id) or not exists(select 1 from public.week4_events where id=published_event) then raise exception 'Deletion affected unrelated content'; end if;

end $$;`);
console.log('Migrations and publication/date checks pass; admin hosting preserves organizer, votes and confirmation time; invalid and unauthorized hosting rejected; simple cancellation/deletion work; Week 4 functions unchanged.');

// Exercise the exposed wrappers with actual database roles in this isolated instance.
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const ownerId='00000000-0000-4000-8000-000000000001',otherId='00000000-0000-4000-8000-000000000002';
await db.exec(`insert into auth.identities(user_id,provider) values('${otherId}','google');`);
async function expectDenied(sql){try{await db.query(sql);}catch(error){if(error.code==='42501')return;throw error;}throw Error('Unauthorized operation succeeded: '+sql);}
const guardedCalls=[
 'select public.week6_admin_data()',
 "select public.week6_admin_command('delete',1,null,'','')",
 "select public.week6_admin_begin('{}','test','test',null)",
 'select public.week6_admin_finish(1,null,null)',
 'select public.week6_admin_cleanup()',
 'select public.week6_admin_cleanup_done(1)',
];
await db.exec('set role anon');
for(const sql of guardedCalls)await expectDenied(sql);
await expectDenied('select public.week6_admin_me()');
await db.exec('reset role;set role authenticated');
for(const [name,uid,claims] of [
 ['No identity','',{}],
 ['Google user without superadmin',otherId,{amr:[{method:'oauth'}]}],
 ['Superadmin without OAuth authentication',ownerId,{amr:[{method:'password'}]}],
]){
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[uid,JSON.stringify(claims)]);
 assert(!(await db.query('select public.week6_admin_me() as me')).rows[0].me.authorized,name+' incorrectly authorized');
 for(const sql of guardedCalls)await expectDenied(sql);
 console.log('PASS authorization: '+name);
}
await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[ownerId,JSON.stringify({amr:[{method:'oauth'}]})]);
assert((await db.query('select public.week6_admin_me() as me')).rows[0].me.authorized,'Google superadmin rejected');
const data=(await db.query('select public.week6_admin_data() as data')).rows[0].data;
for(const [stat,list] of [['users','profiles'],['published','events'],['generations','generations'],['votes','votes']])assert(data.stats[stat]===data[list].length,'Wrong overview count: '+stat);
assert(data.profiles.some(profile=>profile.id===otherId),'Admin could not read another user');
await expectDenied("update public.week4_profiles set first_name='Forbidden' where id='"+otherId+"'");
await expectDenied('delete from public.week4_votes');
console.log('PASS admin data: profiles, generations, events, votes and overview totals; profile/vote writes denied');
await db.exec('reset role');
await db.query("update public.week4_ai_generations set created_at=now()-interval '11 seconds' where user_id=$1",[ownerId]);
await db.exec('set role authenticated');
const gid=(await db.query("select public.week6_admin_begin('{}','Isolated create test','test-no-model-call',null) as gid")).rows[0].gid;
const plan={title:'Isolated generated proposal',description:'Database lifecycle test; no real AI call.',format:'online',location:'Online',starts_at:new Date(Date.now()+86400000).toISOString(),duration_minutes:60,budget:0,capacity:10,cover_id:'study',tags:['study']};
await db.query('select public.week6_admin_finish($1,$2::jsonb,$2::jsonb)',[gid,JSON.stringify(plan)]);
let created=(await db.query('select public.week6_admin_data() as data')).rows[0].data.generations.find(generation=>generation.id===gid);
assert(created?.status==='ready'&&created.original_output.title===plan.title,'Creation lifecycle failed');
await db.query("select public.week6_admin_command('update',$1,$2::jsonb,$3,'')",[gid,JSON.stringify({...plan,title:'Updated draft'}),created.revision]);
try{await db.query("select public.week6_admin_command('update',$1,$2::jsonb,$3,'')",[gid,JSON.stringify(plan),created.revision]);throw Error('Stale revision accepted');}catch(error){if(!error.message.includes('Content changed. Refresh before saving.'))throw error;}
created=(await db.query('select public.week6_admin_data() as data')).rows[0].data.generations.find(generation=>generation.id===gid);
await db.query("select public.week6_admin_command('delete',$1,null,$2,'')",[gid,created.revision]);
assert(!(await db.query('select public.week6_admin_data() as data')).rows[0].data.generations.some(generation=>generation.id===gid),'Draft deletion failed');
console.log('PASS isolated CREATE/READ/UPDATE/DELETE lifecycle and stale-write rejection (AI response supplied as fixture)');
await db.exec('reset role');
await db.close();
