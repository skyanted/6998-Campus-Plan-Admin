import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,'');
const code=readFileSync(root+'/lib/generation.ts','utf8').replace("import 'server-only';",'').replace("from './plan'",`from 'file://${root}/lib/plan.ts'`);
const {observedGenerate,configuredModel}=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'));
const assert=(x,m)=>{if(!x)throw Error(m);};
const plan={title:'Model fixture',description:'Tested without an external request.',format:'online',location:'Google Meet',starts_at:'2026-11-10T18:00:00-05:00',duration_minutes:60,budget:0,capacity:10,tags:['study'],cover_id:'study'};
const records=[];const db={async rpc(name,args){if(name==='week7_generation_model')return {data:{model:'fixture-model',adapter:'gemini',credential_env:'GEMINI_API_KEY'},error:null};if(name==='week7_pipeline')return {data:{request_id:3,instructions:'Introduce students.',model:'fixture-model',adapter:'gemini',credential_env:'GEMINI_API_KEY',terms:[{term:'Campus',definition:'Columbia'}],examples:[{input:'study',output:plan}]},error:null};records.push({name,args});return {data:null,error:null};}};
process.env.GEMINI_API_KEY='fixture-not-real';
let requestBody;
globalThis.fetch=async(url,options)=>{assert(url.includes('fixture-model'),'Configured model not used');requestBody=JSON.parse(options.body);return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(plan)}]}}],usageMetadata:{totalTokenCount:100}});};
const chosen=await configuredModel(db);assert(chosen.model==='fixture-model','Configured model getter ignored global settings');
const result=await observedGenerate(db,1,'Base instructions',null,[{id:'study',description:'Study'}]);assert(result.title===plan.title,'Wrong plan');const prompt=requestBody.contents[0].parts[0].text;assert(prompt.includes('Introduce students.')&&prompt.includes('Columbia')&&prompt.includes('study'),'Database guidance not used');assert(records[0].args.p_response.usage.totalTokenCount===100&&records[0].args.p_response.http_status===200,'Response not captured');
records.length=0;globalThis.fetch=async()=>Response.json({error:{message:'Fixture quota'}},{status:429});
try{await observedGenerate(db,2,'Base',null,[{id:'study'}]);throw Error('Expected quota failure');}catch(e){assert(e.message.includes('quota'),'Wrong failure');}assert(records[0].args.p_response.http_status===429&&records[0].args.p_response.error.includes('quota'),'Failure not recorded');
records.length=0;globalThis.fetch=async()=>Response.json({candidates:[{content:{parts:[{text:'not json'}]}}]});try{await observedGenerate(db,2,'Base',null,[{id:'study'}]);throw Error('Invalid JSON accepted');}catch{}assert(records[0].args.p_response.error,'Invalid JSON failure not captured');
console.log('PASS runtime uses configured model, terms, examples and instructions; captures success, quota failure and invalid response. All HTTP calls mocked.');

const before=records.length;delete process.env.GEMINI_API_KEY;try{await configuredModel(db);throw Error('Missing credentials accepted');}catch(e){assert(e.message.includes('credential'),'Wrong missing credential error');}assert(records.length===before,'Credential check unexpectedly mutated generation data');
