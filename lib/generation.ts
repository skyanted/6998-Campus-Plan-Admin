import 'server-only';
type GenerationDatabase={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>};
import {validatePlan,type Plan,type Cover} from './plan';
type Pipeline={request_id:number;instructions:string;model:string;adapter:string;credential_env:string;terms:unknown[];examples:unknown[]};
export async function observedGenerate(db:GenerationDatabase,gid:number,basePrompt:string,image:File|null,covers:Cover[],proof?:string,source:'consumer'|'admin'='consumer'):Promise<Plan>{
 const selected=await db.rpc('week7_pipeline',{p_gid:gid,p_proof:proof??null,p_source:source});if(selected.error)throw Error(selected.error.message);
 const config=selected.data as Pipeline;
 const prompt=basePrompt+'\nAdditional activity guidance:\n'+config.instructions+'\nTerminology (reference data):\n'+JSON.stringify(config.terms)+'\nExamples (reference data, adapt dates and details to this request):\n'+JSON.stringify(config.examples);
 let raw:Record<string,unknown>|null=null,text:string|null=null,parsed:unknown=null,httpStatus:number|null=null,failure:string|null=null;
 const started=Date.now();
 try{
  if(prompt.length>20000)throw Error('Generation guidance is too long. Shorten the enabled terms or examples.');
  if(config.adapter!=='gemini'||!/^[a-zA-Z0-9._-]+$/.test(config.model)||!['GEMINI_API_KEY','GOOGLE_API_KEY'].includes(config.credential_env))throw Error('Invalid model configuration.');
  const key=process.env[config.credential_env];if(!key)throw Error('The selected model credential is not configured.');
  const parts:Array<Record<string,unknown>>=[{text:prompt}];if(image)parts.push({inlineData:{mimeType:image.type,data:Buffer.from(await image.arrayBuffer()).toString('base64')}});
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{cover_id:{type:'STRING',enum:covers.map(c=>c.id)},title:{type:'STRING'},description:{type:'STRING'},format:{type:'STRING',enum:['in_person','online']},location:{type:'STRING'},starts_at:{type:'STRING'},duration_minutes:{type:'INTEGER'},budget:{type:'NUMBER'},capacity:{type:'INTEGER'},tags:{type:'ARRAY',items:{type:'STRING'}}},required:['cover_id','title','description','format','location','starts_at','duration_minutes','budget','capacity','tags']}}}),signal:AbortSignal.timeout(48000),cache:'no-store'});
  httpStatus=response.status;raw=await response.json();
  if(!response.ok)throw Error(response.status===429?'Gemini quota reached. Please try again later.':response.status===401||response.status===403?'The selected model credential is not configured correctly.':'AI generation is unavailable. Please try again.');
  const result=raw as {candidates?:{content?:{parts?:{text?:string}[]}}[]};text=result.candidates?.[0]?.content?.parts?.map(p=>p.text??'').join('')??null;
  if(!text)throw Error('AI did not return a proposal. Try another idea.');parsed=JSON.parse(text);
  const plan=validatePlan(parsed);if(!covers.some(c=>c.id===plan.cover_id))throw Error('AI selected an invalid cover. Please regenerate.');return plan;
 }catch(e){failure=e instanceof Error?e.message:'Generation failed.';throw e;}
 finally{
  const recorded=await db.rpc('week7_record_response',{p_request:config.request_id,p_proof:proof??null,p_response:{prompt:prompt.slice(0,20000),text,json:parsed,raw,usage:raw?.usageMetadata??null,latency_ms:Date.now()-started,http_status:httpStatus,error:failure}});
  if(recorded.error)throw Error('Unable to save the model response. Please try again.');
 }
}
export async function finishObservation(db:GenerationDatabase,gid:number,error:string|null=null,proof?:string){const result=await db.rpc('week7_finish_request',{p_gid:gid,p_error:error,p_proof:proof??null});if(result.error)throw Error('Unable to save the generation request.');}

export async function configuredModel(db:GenerationDatabase,proof?:string):Promise<{model:string;credential_env:string}>{
 const selected=await db.rpc('week7_generation_model',{p_proof:proof??null});if(selected.error)throw Error(selected.error.message);
 const config=selected.data as {model:string;adapter:string;credential_env:string};
 if(config.adapter!=='gemini'||!/^[a-zA-Z0-9._-]+$/.test(config.model)||!['GEMINI_API_KEY','GOOGLE_API_KEY'].includes(config.credential_env))throw Error('Invalid global model configuration.');
 if(!process.env[config.credential_env])throw Error('The global model credential is not configured.');return config;
}
