import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('..',import.meta.url).pathname;
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
create table auth.identities(user_id uuid,provider text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity primary key,bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`);
await db.exec(readFileSync(root+'/tests/fixtures/week4-baseline.sql','utf8').split('create extension if not exists pg_cron')[0]);
const order=['20261022_campus_admin.sql','20261022_admin_rpc_wrappers.sql',...readdirSync(root+'/supabase/migrations').filter(n=>/^20261022\d/.test(n)).sort()];
for(const name of order)await db.exec(readFileSync(root+'/supabase/migrations/'+name,'utf8'));
await db.exec(readFileSync(root+'/supabase/migrations/20261029190000_week7_observability.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/migrations/20261029200000_global_generation_model.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/migrations/20261029210000_retain_discarded_images.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/migrations/20261029220000_prompt_traffic_editor.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/migrations/20261029230000_select_catalog_model.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/migrations/20261030010000_prompt_workshop_controls.sql','utf8'));
await db.exec(readFileSync(root+'/supabase/migrations/20261031010000_edit_prompt_chain.sql','utf8'));
console.log('Week 7 SQL compiled with global model control and upload retention');
await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000001','admin@columbia.edu',now(),now());insert into auth.identities values('00000000-0000-4000-8000-000000000001','google');insert into private.week6_admin_access(user_id,is_superadmin) values('00000000-0000-4000-8000-000000000001',true);`);
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false),set_config('request.jwt.claims','{"amr":[{"method":"oauth"}]}',false)`);
const assert=(x,m)=>{if(!x)throw Error(m);};
for(const section of ['prompt-chains','prompt-steps','prompt-mix','terms','examples','models','providers','signup-domains','whitelisted-emails','generation-requests','llm-responses','images','users']){const r=await db.query('select public.week7_admin_data($1) data',[section]);assert(Array.isArray(r.rows[0].data),'Bad section '+section);}
for(const [section,payload,updated] of [['terms',{term:'Test',definition:'Test term'},{definition:'Updated'}],['providers',{name:'Test provider'},{name:'Renamed'}],['models',{provider_id:1,name:'Test model',identifier:'test-model'},{name:'New name'}],['signup-domains',{domain:'example.edu'},{domain:'other.edu'}],['whitelisted-emails',{email:'test@example.com'},{email:'next@example.com'}]]){
 const created=(await db.query("select public.week7_admin_save($1,'create',null,$2::jsonb) data",[section,JSON.stringify(payload)])).rows[0].data;
 let rows=(await db.query('select public.week7_admin_data($1) data',[section])).rows[0].data;let row=rows.find(r=>r.id===created.id);
 await db.query("select public.week7_admin_save($1,'update',$2,$3::jsonb,$4)",[section,row.id,JSON.stringify(updated),row.revision]);
 rows=(await db.query('select public.week7_admin_data($1) data',[section])).rows[0].data;row=rows.find(r=>r.id===created.id);
 await db.query("select public.week7_admin_save($1,'delete',$2,'{}',$3)",[section,row.id,row.revision]);console.log('CRUD '+section);
}

const admin='00000000-0000-4000-8000-000000000001',student='00000000-0000-4000-8000-000000000002',blocked='00000000-0000-4000-8000-000000000003';
async function denied(sql,args=[]){try{await db.query(sql,args);}catch(e){if(e.code==='42501')return;throw e;}throw Error('Unauthorized operation succeeded: '+sql);}
async function rejects(sql,args=[]){try{await db.query(sql,args);}catch{return;}throw Error('Invalid operation accepted: '+sql);}
async function identity(id,oauth=true){await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({amr:[{method:oauth?'oauth':'password'}]})]);}
await db.exec('reset role');
await db.exec(`insert into auth.users values('${student}','student@columbia.edu',now(),now()),('${blocked}','outside@example.com',now(),now());insert into auth.identities values('${student}','google'),('${blocked}','google');insert into private.week4_generation_config(singleton,secret_hash) values(true,md5('fixture-proof')) on conflict(singleton) do update set secret_hash=excluded.secret_hash;`);
await db.exec('set role anon');await denied("select public.week7_admin_data('terms')");await denied('select public.week7_signup_allowed()');
await db.exec('reset role;set role authenticated');await identity(blocked);
assert(!(await db.query('select public.week7_signup_allowed() allowed')).rows[0].allowed,'Blocked signup accepted');
await denied("select public.week4_profile_save()");
for(const id of [student,admin]){
 await identity(id,id!==admin);await denied("select public.week7_admin_data('terms')");await denied("select public.week7_admin_save('terms','create',null,'{}')");await denied("select public.week7_pipeline(1,null)");
}
await identity(admin);
const plan={title:'Fixture example',description:'An example for an isolated SQL test.',format:'online',location:'Google Meet',starts_at:new Date(Date.now()+86400000).toISOString(),duration_minutes:60,budget:0,capacity:10,cover_id:'study',tags:['study']};
const example=(await db.query("select public.week7_admin_save('examples','create',null,$1) r",[JSON.stringify({title:'Fixture',input:'Study online',output:plan,enabled:true})])).rows[0].r;
let er=(await db.query("select public.week7_admin_data('examples') rows")).rows[0].rows.find(r=>r.id===example.id);
await db.query("select public.week7_admin_save('examples','update',$1,$2,$3)",[er.id,JSON.stringify({title:'Edited example'}),er.revision]);
await rejects("select public.week7_admin_save('examples','update',$1,$2,$3)",[er.id,JSON.stringify({title:'Stale'}),er.revision]);
er=(await db.query("select public.week7_admin_data('examples') rows")).rows[0].rows.find(r=>r.id===example.id);
await db.query("select public.week7_admin_save('examples','delete',$1,'{}',$2)",[er.id,er.revision]);
await rejects("select public.week7_admin_save('terms','create',null,'{\"term\":\"Injection\",\"definition\":\"x\",\"id\":999}')");
let mixes=(await db.query("select public.week7_admin_data('prompt-mix') rows")).rows[0].rows;
const primary=mixes.find(r=>r.weight>0),secondary=mixes.find(r=>r.weight===0);
await rejects("select public.week7_admin_save('prompt-mix','update',$1,'{\"weight\":0}',$2)",[primary.id,primary.revision]);
await db.query("select public.week7_admin_save('prompt-mix','update',$1,'{\"weight\":100}',$2)",[secondary.id,secondary.revision]);
await db.query("select public.week7_admin_save('prompt-mix','update',$1,'{\"weight\":0}',$2)",[primary.id,primary.revision]);
await db.query('select public.week4_profile_save()');
const gid=(await db.query("select public.week6_admin_begin('{}','Fixture prompt','fixture-model',null) gid")).rows[0].gid;
let request=(await db.query("select public.week7_admin_data('generation-requests') rows")).rows[0].rows.find(r=>r.generation_id===gid);
assert(request?.status==='pending','Begin request was not tracked');
const config=(await db.query("select public.week7_pipeline($1,null,'admin') r",[gid])).rows[0].r;
assert(config.chain_id===secondary.chain_id,'Mix did not choose enabled weighted chain');
assert(config.terms.length>0&&config.instructions&&config.model,'Configuration snapshot missing');
await db.query("select public.week7_record_response($1,$2,null)",[config.request_id,JSON.stringify({prompt:'Fixture rendered prompt',text:JSON.stringify(plan),json:plan,raw:{fixture:true},usage:{totalTokenCount:100},latency_ms:120,http_status:200})]);
await db.query('select public.week6_admin_finish($1,$2,$2)',[gid,JSON.stringify(plan)]);
await db.query('select public.week7_finish_request($1,null,null)',[gid]);
request=(await db.query("select public.week7_admin_data('generation-requests') rows")).rows[0].rows.find(r=>r.generation_id===gid);
assert(request.status==='ready'&&request.source==='admin'&&request.completed_at,'Request result missing');
const response=(await db.query("select public.week7_admin_data('llm-responses') rows")).rows[0].rows.find(r=>r.request_id===request.id);
assert(response?.latency_ms===120&&response.usage.totalTokenCount===100&&response.raw_response.fixture,'Response data missing');
await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name) values('week4-event-images',$1)",[admin+'/fixture.jpg']);await db.exec('set role authenticated');
let image=(await db.query("select public.week7_admin_data('images') rows")).rows[0].rows.find(r=>r.path===admin+'/fixture.jpg');assert(image?.available,'Image not registered');
await db.query("select public.week7_admin_save('images','update',$1,'{\"label\":\"Edited image\"}',$2)",[image.id,image.revision]);
image=(await db.query("select public.week7_admin_data('images') rows")).rows[0].rows.find(r=>r.id===image.id);
await db.query("select public.week7_admin_save('images','delete',$1,'{}',$2)",[image.id,image.revision]);
await identity(student);assert((await db.query('select public.week7_signup_allowed() allowed')).rows[0].allowed,'Allowed signup rejected');await db.query('select public.week4_profile_save()');
const studentGid=(await db.query("select public.week4_begin_generation('{}','Student fixture','fixture',null) gid")).rows[0].gid;
await denied('select public.week7_pipeline($1,null)',[studentGid]);
const studentConfig=(await db.query("select public.week7_pipeline($1,'fixture-proof','consumer') r",[studentGid])).rows[0].r;
await denied("select public.week7_record_response($1,'{}',null)",[studentConfig.request_id]);
await db.query("select public.week7_record_response($1,'{\"prompt\":\"Failed fixture\",\"error\":\"Fixture error\",\"latency_ms\":1}','fixture-proof')",[studentConfig.request_id]);
await db.query("select public.week4_finish_generation(gid=>$1,result=>null,generation_proof=>'fixture-proof',original_result=>null)",[studentGid]);
await db.query("select public.week7_finish_request($1,'Fixture error','fixture-proof')",[studentGid]);
await identity(admin);
request=(await db.query("select public.week7_admin_data('generation-requests') rows")).rows[0].rows.find(r=>r.generation_id===studentGid);assert(request.status==='failed'&&request.error==='Fixture error'&&request.source==='consumer','Failed request not tracked');
console.log('PASS Google-only superadmin gates; signup allow/deny; example CRUD; stale writes; mix updates affect selection; live-shaped success/failure records; image tracking and CRUD. No real model calls.');

// A single global provider/model applies to both applications and all chains.
const initialGlobal=(await db.query('select public.week7_admin_global_model() config')).rows[0].config;
await identity(student);
await denied('select public.week7_admin_global_model()');
await denied('select public.week7_admin_set_global_model($1,$2,$3)',[initialGlobal.provider_id,'fixture-global',initialGlobal.revision]);
await denied('select public.week7_generation_model(null)');
await identity(admin,false);await denied('select public.week7_admin_global_model()');
await identity(admin);
await rejects('select public.week7_admin_set_global_model($1,$2,$3)',[initialGlobal.provider_id,'bad/model',initialGlobal.revision]);
await rejects('select public.week7_admin_set_global_model($1,$2,$3)',[999999,'fixture-global',initialGlobal.revision]);
const activeProvider=(await db.query("select public.week7_admin_data('providers') rows")).rows[0].rows.find(p=>p.id===initialGlobal.provider_id);
const activeModel=(await db.query("select public.week7_admin_data('models') rows")).rows[0].rows.find(m=>m.id===initialGlobal.model_id);
await rejects("select public.week7_admin_save('models','delete',$1,'{}',$2)",[activeModel.id,activeModel.revision]);
await rejects("select public.week7_admin_save('models','update',$1,'{\"enabled\":false}',$2)",[activeModel.id,activeModel.revision]);
await rejects("select public.week7_admin_save('providers','update',$1,'{\"enabled\":false}',$2)",[activeProvider.id,activeProvider.revision]);
const otherProvider=(await db.query("select public.week7_admin_save('providers','create',null,'{\"name\":\"Alternate Google\"}') provider")).rows[0].provider;
const changedGlobal=(await db.query('select public.week7_admin_set_global_model($1,$2,$3) config',[otherProvider.id,'fixture-global',initialGlobal.revision])).rows[0].config;
assert(changedGlobal.identifier==='fixture-global'&&changedGlobal.provider_id===otherProvider.id&&changedGlobal.revision!==initialGlobal.revision,'Global settings did not change');
await rejects('select public.week7_admin_set_global_model($1,$2,$3)',[initialGlobal.provider_id,'stale-global',initialGlobal.revision]);
assert(!(await db.query("select public.week7_admin_data('models') rows")).rows[0].rows.some(m=>m.identifier==='stale-global'),'Rejected change created a model');
const generationModels=[];
for(const [uid,source,proof] of [[admin,'admin',null],[student,'consumer','fixture-proof']]){
 await db.exec('reset role');const testGid=(await db.query("insert into public.week4_ai_generations(user_id,inputs,prompt,model,status) values($1,'{}','Global model fixture','old-env-model','pending') returning id",[uid])).rows[0].id;
 await db.exec('set role authenticated');await identity(uid);
 const globalConfig=(await db.query('select public.week7_generation_model($1) config',[proof])).rows[0].config;
 const pipeline=(await db.query('select public.week7_pipeline($1,$2,$3) config',[testGid,proof,source])).rows[0].config;
 assert(globalConfig.model==='fixture-global'&&pipeline.model==='fixture-global'&&pipeline.provider==='Alternate Google'&&pipeline.adapter==='gemini',source+' did not use the global model');
 generationModels.push(pipeline.model);
}
assert(generationModels[0]===generationModels[1],'Applications selected different global models');
await identity(admin);
const oldResponse=(await db.query("select public.week7_admin_data('llm-responses') rows")).rows[0].rows.find(r=>r.id===response.id);
assert(oldResponse.model===response.model,'Switching the global model rewrote historical responses');
const latest=(await db.query('select public.week7_admin_global_model() config')).rows[0].config;
await db.query('select public.week7_admin_set_global_model($1,$2,$3)',[initialGlobal.provider_id,initialGlobal.identifier,latest.revision]);
console.log('PASS global model provider/name updates; admin and consumer use the same selection; active model/provider protected; invalid and stale changes rejected; historical responses preserved.');


// Simulate real Storage RLS: discarded uploads survive both publication flows
// and delete requests from older clients. All objects exist only in PGlite.
await db.exec('reset role;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;grant usage,select on sequence storage.objects_id_seq to authenticated');
for(const [uid,flow] of [[admin,'admin'],[student,'consumer']]){
 await db.exec('reset role');
 await db.query("update public.week4_profiles set first_name='Retention',last_name='Check' where id=$1",[uid]);
 const publishedPath=uid+'/retain-published.jpg',discardedPath=uid+'/retain-discarded.jpg';
 const target=(await db.query("insert into public.week4_ai_generations(user_id,inputs,prompt,model,output,status,image_path) values($1,'{}','Retain target','fixture',$2,'ready',$3) returning id",[uid,JSON.stringify(plan),publishedPath])).rows[0].id;
 const sibling=(await db.query("insert into public.week4_ai_generations(user_id,inputs,prompt,model,output,status,image_path) values($1,'{}','Retain sibling','fixture',$2,'ready',$3) returning id",[uid,JSON.stringify(plan),discardedPath])).rows[0].id;
 await db.exec('set role authenticated');await identity(uid);
 await db.query("insert into storage.objects(bucket_id,name) values('week4-event-images',$1),('week4-event-images',$2)",[publishedPath,discardedPath]);
 if(flow==='admin'){
  const targetRow=(await db.query('select public.week6_admin_data() data')).rows[0].data.generations.find(g=>g.id===target);
  await db.query("select public.week6_admin_command('publish',$1,null,$2,'')",[target,targetRow.revision]);
 }else await db.query('select public.week4_publish(gid=>$1,event_time=>$2::timestamptz)',[target,plan.starts_at]);
 assert((await db.query('select status from public.week4_ai_generations where id=$1',[sibling])).rows[0].status==='discarded','Sibling draft was not discarded');
 assert((await db.query("delete from storage.objects where bucket_id='week4-event-images' and name=$1 returning id",[discardedPath])).rows.length===0,flow+' removed a discarded upload');
 assert((await db.query("select id from storage.objects where bucket_id='week4-event-images' and name=$1",[discardedPath])).rows.length===1,flow+' lost its discarded upload');
 await identity(admin);
 assert(!(await db.query('select public.week6_admin_cleanup() rows')).rows[0].rows.some(q=>q.path===discardedPath),'Discarded upload was queued for automatic cleanup');
 const listed=(await db.query("select public.week7_admin_data('images') rows")).rows[0].rows.find(i=>i.path===discardedPath);
 assert(listed?.in_use&&listed.available,'Historical upload not marked as retained/in use');
 await rejects("select public.week7_admin_save('images','delete',$1,'{}',$2)",[listed.id,listed.revision]);
 assert((await db.query("delete from storage.objects where bucket_id='week4-event-images' and name=$1 returning id",[discardedPath])).rows.length===0,'Admin could delete a retained upload directly');
 const row=(await db.query('select public.week6_admin_data() data')).rows[0].data.generations.find(g=>g.id===sibling);
 await db.query("select public.week6_admin_command('delete',$1,null,$2,'')",[sibling,row.revision]);
 assert((await db.query('select public.week6_admin_cleanup() rows')).rows[0].rows.some(q=>q.path===discardedPath),'Permanent deletion did not queue the now-unused upload');
 assert((await db.query("delete from storage.objects where bucket_id='week4-event-images' and name=$1 returning id",[discardedPath])).rows.length===1,'Permanent deletion could not remove the now-unused upload');
}
await db.exec('reset role');
const failedPath=student+'/failed-upload.jpg';
await db.query("insert into public.week4_ai_generations(user_id,inputs,prompt,model,status,image_path) values($1,'{}','Failed fixture','fixture','failed',$2)",[student,failedPath]);
await db.exec('set role authenticated');await identity(student);
await db.query("insert into storage.objects(bucket_id,name) values('week4-event-images',$1)",[failedPath]);
assert((await db.query("delete from storage.objects where bucket_id='week4-event-images' and name=$1 returning id",[failedPath])).rows.length===1,'Failed-upload cleanup was blocked');
console.log('PASS consumer and admin publication retain discarded photos; legacy delete requests blocked; explicit permanent deletion and failed-upload cleanup still work.');


await identity(student);
await denied("insert into storage.objects(bucket_id,name) values('week7-admin-images',$1) returning id",[student+'/denied.jpg']);
await identity(admin);
const standalone=admin+'/standalone.jpg';
assert((await db.query("insert into storage.objects(bucket_id,name) values('week7-admin-images',$1) returning id",[standalone])).rows.length===1,'Admin upload could not be read before registration');
const registered=(await db.query("select public.week7_register_image('week7-admin-images',$1,'Standalone fixture') image",[standalone])).rows[0].image;
assert(registered.path===standalone,'Standalone upload not registered');
assert((await db.query("delete from storage.objects where bucket_id='week7-admin-images' and name=$1 returning id",[standalone])).rows.length===1,'Unused admin upload could not be deleted');
console.log('PASS Google admin upload/registration and unused-image deletion; ordinary users cannot upload to the admin library.');


// Whole-form usage percentages commit atomically, including switching the only active chain.
await identity(student);await denied("select public.week7_admin_set_prompt_mix('[]')");
await identity(admin);
const readMix=async()=>(await db.query("select public.week7_admin_data('prompt-mix') rows")).rows[0].rows.sort((a,b)=>a.id-b.id);
const payloadFor=(rows,weights)=>rows.map((row,index)=>({id:row.id,revision:row.revision,weight:weights[index]}));
let split=await readMix();await rejects('select public.week7_admin_set_prompt_mix($1)',[JSON.stringify(payloadFor(split,[20,20]))]);
await db.query('select public.week7_admin_set_prompt_mix($1)',[JSON.stringify(payloadFor(split,[50,50]))]);
split=await readMix();assert(split.every(row=>row.weight===50),'Usage split was not applied');
const stale=payloadFor(split,[0,100]);await db.query("select public.week7_admin_save('prompt-mix','update',$1,'{\"weight\":45}',$2)",[split[1].id,split[1].revision]);
await rejects('select public.week7_admin_set_prompt_mix($1)',[JSON.stringify(stale)]);
let after=await readMix();assert(after[0].weight===50&&after[1].weight===45,'A stale form partially updated the split');
await db.query('select public.week7_admin_set_prompt_mix($1)',[JSON.stringify(payloadFor(after,[0,100]))]);
after=await readMix();assert(after[0].weight===0&&after[1].weight===100,'Atomic chain switch failed');
console.log('PASS complete percentage form: total must be 100, stale submissions roll back entirely, and active chains can be switched atomically.');

await db.exec('reset role');

await identity(admin);
const listModels=async()=>(await db.query("select public.week7_admin_data('models') rows")).rows[0].rows;
const listProviders=async()=>(await db.query("select public.week7_admin_data('providers') rows")).rows[0].rows;
const currentModel=async()=>(await db.query('select public.week7_admin_global_model() settings')).rows[0].settings;
const available=(await listModels()).find(row=>row.enabled&&row.id!==(changedGlobal.model_id));
const provider=(await listProviders()).find(row=>row.id===available.provider_id);
const beforeSwitch=await currentModel(),beforeCount=(await listModels()).length;
await rejects('select public.week7_admin_use_model($1,$2,$3,$4)',[available.id,'stale',provider.revision,beforeSwitch.revision]);
await rejects('select public.week7_admin_use_model($1,$2,$3,$4)',[available.id,available.revision,'stale',beforeSwitch.revision]);
await db.query('select public.week7_admin_use_model($1,$2,$3,$4)',[available.id,available.revision,provider.revision,beforeSwitch.revision]);
assert((await currentModel()).model_id===available.id,'Catalog model switch failed');
assert((await listModels()).length===beforeCount,'Switch created a model');
await rejects('select public.week7_admin_use_model($1,$2,$3,$4)',[available.id,available.revision,provider.revision,beforeSwitch.revision]);
await identity(student);await denied("select public.week7_admin_use_model(1,'x','x','x')");
console.log('PASS model switching only selects an existing unchanged model; stale model/provider/settings and non-admin denied.');

// Workshop configuration: real permissions, atomic creation and captured runtime values.
await db.exec('set role authenticated');await identity(student);
await denied('select public.week7_admin_app_rules()');
await denied("select public.week7_admin_set_app_rules('x','x')");
await denied("select public.week7_admin_create_chain('{}')");
await denied('select * from private.week7_app_rules');
await identity(admin,false);await denied('select public.week7_admin_app_rules()');
await identity(admin);
let rules=(await db.query('select public.week7_admin_app_rules() r')).rows[0].r;
assert(rules.template.includes('{{current_time}}')&&rules.revision.length===32,'Default rules unavailable');
const updatedRules=rules.template+'\nWorkshop fixture guidance.';
await rejects('select public.week7_admin_set_app_rules($1,$2)',['No variables',rules.revision]);
await db.query('select public.week7_admin_set_app_rules($1,$2)',[updatedRules,rules.revision]);
await rejects('select public.week7_admin_set_app_rules($1,$2)',[rules.template,rules.revision]);
assert((await db.query('select public.week7_admin_app_rules() r')).rows[0].r.template===updatedRules,'Stale rule update overwrote newer rules');
const previousMix=await readMix();
await rejects("select public.week7_admin_create_chain('{\"name\":\"Bad\",\"instructions\":\"\"}')");
await rejects("select public.week7_admin_create_chain('{\"name\":\"Bad\",\"instructions\":\"x\",\"weight\":100}')");
const chainPayload={name:'Workshop fixture chain',description:'Fixture',instructions:'Use the captured workshop instruction.'};
const chain=(await db.query('select public.week7_admin_create_chain($1) r',[JSON.stringify(chainPayload)])).rows[0].r;
await rejects('select public.week7_admin_create_chain($1)',[JSON.stringify(chainPayload)]);
const addedMix=await readMix(),addedStep=(await db.query("select public.week7_admin_data('prompt-steps') rows")).rows[0].rows.find(row=>row.chain_id===chain.id);
assert(addedMix.length===previousMix.length+1&&addedMix.find(row=>row.chain_id===chain.id).weight===0,'New chain changed existing traffic');
assert(previousMix.every(row=>addedMix.find(next=>next.id===row.id).weight===row.weight),'Existing traffic weights changed');
assert(addedStep?.position===1&&addedStep.instructions===chainPayload.instructions,'New chain step missing');
await db.query('select public.week7_admin_set_prompt_mix($1)',[JSON.stringify(addedMix.map(row=>({id:row.id,revision:row.revision,weight:row.chain_id===chain.id?100:0})))]);
const enabledTerm=(await db.query("select public.week7_admin_save('terms','create',null,'{\"term\":\"Enabled fixture\",\"definition\":\"Include me\"}') r")).rows[0].r;
const disabledTerm=(await db.query("select public.week7_admin_save('terms','create',null,'{\"term\":\"Disabled fixture\",\"definition\":\"Exclude me\",\"enabled\":false}') r")).rows[0].r;
const enabledExample=(await db.query("select public.week7_admin_save('examples','create',null,$1) r",[JSON.stringify({title:'Enabled fixture',input:'Enabled sample',output:plan})])).rows[0].r;
const disabledExample=(await db.query("select public.week7_admin_save('examples','create',null,$1) r",[JSON.stringify({title:'Disabled fixture',input:'Disabled sample',output:plan,enabled:false})])).rows[0].r;
const snapshots=[];
for(const [uid,source,proof] of [[admin,'admin',null],[student,'consumer','fixture-proof']]){
 await db.exec('reset role');
 const nextGid=(await db.query("insert into public.week4_ai_generations(user_id,inputs,prompt,model,status) values($1,'{}','Workshop fixture','fixture','pending') returning id",[uid])).rows[0].id;
 await db.exec('set role authenticated');await identity(uid);
 const pipeline=(await db.query('select public.week7_pipeline($1,$2,$3) r',[nextGid,proof,source])).rows[0].r;
 assert(pipeline.chain_id===chain.id&&pipeline.instructions===chainPayload.instructions,'Selected added chain was ignored');
 assert(pipeline.app_rules===updatedRules,'Global rules not captured for '+source);
 assert(pipeline.terms.some(t=>t.term===enabledTerm.term)&&!pipeline.terms.some(t=>t.term===disabledTerm.term),'Term toggle not used by '+source);
 assert(pipeline.examples.some(e=>e.input===enabledExample.input)&&!pipeline.examples.some(e=>e.input===disabledExample.input),'Example toggle not used by '+source);
 snapshots.push(pipeline);
}
await identity(admin);
for(const [section,row] of [['terms',enabledTerm],['examples',enabledExample]]){
 const current=(await db.query('select public.week7_admin_data($1) rows',[section])).rows[0].rows.find(item=>item.id===row.id);
 await db.query("select public.week7_admin_save($1,'update',$2,'{\"enabled\":false}',$3)",[section,row.id,current.revision]);
 await rejects("select public.week7_admin_save($1,'update',$2,'{\"enabled\":true}',$3)",[section,row.id,current.revision]);
}
const snapRows=(await db.query("select public.week7_admin_data('generation-requests') rows")).rows[0].rows;
assert(snapshots.every(snapshot=>snapRows.find(row=>row.id===snapshot.request_id).snapshot.app_rules===updatedRules),'Configuration edits changed historical snapshots');
console.log('PASS workshop rules and chain creation: Google superadmin guard, stale/invalid saves, atomic chain + step + zero-weight mix, both applications use captured rules and enabled references, history preserved.');


// Chain edits save metadata and the real generation instruction together.
await identity(admin);
const readChains=async()=>(await db.query("select public.week7_admin_data('prompt-chains') rows")).rows[0].rows;
const readSteps=async()=>(await db.query("select public.week7_admin_data('prompt-steps') rows")).rows[0].rows;
const initialChain=(await readChains()).find(row=>row.id===chain.id);
const initialStep=(await readSteps()).find(row=>row.chain_id===chain.id);
const mixBeforeEdit=await readMix();
const editedPayload={name:'Edited workshop chain',description:'Edited description',instructions:'Use the edited generation instruction.'};
await db.query('select public.week7_admin_update_chain($1,$2,$3,$4,$5)',[chain.id,initialChain.revision,initialStep.id,initialStep.revision,JSON.stringify(editedPayload)]);
const editedChain=(await readChains()).find(row=>row.id===chain.id),editedStep=(await readSteps()).find(row=>row.id===initialStep.id);
assert(editedChain.name===editedPayload.name&&editedChain.description===editedPayload.description&&editedStep.instructions===editedPayload.instructions,'Chain edits not saved');
assert(JSON.stringify(await readMix())===JSON.stringify(mixBeforeEdit),'Editing changed chain traffic');
await rejects('select public.week7_admin_update_chain($1,$2,$3,$4,$5)',[chain.id,initialChain.revision,initialStep.id,initialStep.revision,JSON.stringify(editedPayload)]);
await rejects('select public.week7_admin_update_chain($1,$2,$3,$4,$5)',[chain.id,editedChain.revision,initialStep.id,initialStep.revision,JSON.stringify(editedPayload)]);
const other=(await readChains()).find(row=>row.id!==chain.id),otherStep=(await readSteps()).find(row=>row.chain_id===other.id);
await rejects('select public.week7_admin_update_chain($1,$2,$3,$4,$5)',[chain.id,editedChain.revision,otherStep.id,otherStep.revision,JSON.stringify(editedPayload)]);
await rejects('select public.week7_admin_update_chain($1,$2,$3,$4,$5)',[chain.id,editedChain.revision,editedStep.id,editedStep.revision,JSON.stringify({...editedPayload,name:other.name,instructions:'Must not save'})]);
assert((await readSteps()).find(row=>row.id===initialStep.id).instructions===editedPayload.instructions,'Failed edit changed instructions');
const historyAfterEdit=(await db.query("select public.week7_admin_data('generation-requests') rows")).rows[0].rows;
assert(snapshots.every(snapshot=>historyAfterEdit.find(row=>row.id===snapshot.request_id).snapshot.instructions===chainPayload.instructions),'Chain edit rewrote historical instructions');
await db.exec('reset role');
const editGid=(await db.query("insert into public.week4_ai_generations(user_id,inputs,prompt,model,status) values($1,'{}','Edited chain fixture','fixture','pending') returning id",[admin])).rows[0].id;
await db.exec('set role authenticated');await identity(admin);
const editedPipeline=(await db.query("select public.week7_pipeline($1,null,'admin') r",[editGid])).rows[0].r;
assert(editedPipeline.instructions===editedPayload.instructions,'New generation ignored edited instruction');
await identity(student);await denied("select public.week7_admin_update_chain(1,'x',1,'x','{}')");
await identity(admin,false);await denied("select public.week7_admin_update_chain(1,'x',1,'x','{}')");
console.log('PASS chain editing: metadata and instruction saved atomically; stale chain/step, mismatched step, duplicate name and unauthorized session rejected; traffic and history preserved; new generations use the edit.');

await db.close();
