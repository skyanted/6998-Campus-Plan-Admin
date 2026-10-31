import {requireAdmin,sameOrigin,errorResponse} from '@/lib/access';
import {authClient} from '@/lib/supabase';
import {validateGenerationModel} from '@/lib/model-validation';
import type {Row} from '@/lib/week7';
export async function POST(request:Request){try{
 sameOrigin(request);await requireAdmin();
 if(Number(request.headers.get('content-length'))>40000)throw Error('The record is too large.');
 const value=await request.json(),{section,action,id,payload,revision}=value;
 if(typeof section!=='string'||!['create','update','delete'].includes(action)||(action!=='create'&&section!=='prompt-traffic'&&(!Number.isSafeInteger(id)||id<1||typeof revision!=='string'||!/^[a-f0-9]{32}$/.test(revision))))throw Error('Invalid request.');
 const db=await authClient();
 if(section==='app-rules'){
  if(action!=='update'||id!==1||!payload||typeof payload!=='object'||Object.keys(payload).some(key=>key!=='template')||typeof payload.template!=='string'||!payload.template.trim()||payload.template.length>10000)throw Error('Enter app rules up to 10000 characters.');
  const saved=await db.rpc('week7_admin_set_app_rules',{p_template:payload.template,p_revision:revision});if(saved.error)throw Error(saved.error.message);return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }
 if(section==='prompt-chains'){
  const fields=action==='update'?['name','description','instructions','step_id','step_revision']:['name','description','instructions'];
  if(!['create','update'].includes(action)||!payload||typeof payload!=='object'||Object.keys(payload).some(key=>!fields.includes(key))||typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>100||typeof payload.instructions!=='string'||!payload.instructions.trim()||payload.instructions.length>4000||(payload.description!==undefined&&(typeof payload.description!=='string'||payload.description.length>1000)))throw Error('Enter a chain name and generation instruction.');
  if(action==='update'&&(!Number.isSafeInteger(payload.step_id)||payload.step_id<1||typeof payload.step_revision!=='string'||!/^[a-f0-9]{32}$/.test(payload.step_revision)))throw Error('Chain changed. Refresh before editing.');
  const clean={name:payload.name,description:payload.description??'',instructions:payload.instructions};
  const saved=action==='create'?await db.rpc('week7_admin_create_chain',{p_payload:clean}):await db.rpc('week7_admin_update_chain',{p_chain:id,p_revision:revision,p_step:payload.step_id,p_step_revision:payload.step_revision,p_payload:clean});
  if(saved.error)throw Error(saved.error.message);return Response.json({id:saved.data.id},{headers:{'Cache-Control':'private, no-store'}});
 }
 if(section==='prompt-traffic'){
  if(action!=='update'||!payload||typeof payload!=='object'||!Array.isArray(payload.rows)||payload.rows.length>100)throw Error('Enter a percentage for each prompt chain.');
  const saved=await db.rpc('week7_admin_set_prompt_mix',{p_rows:payload.rows});if(saved.error)throw Error(saved.error.message);return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }

 async function records(section:string):Promise<Row[]>{const result=await db.rpc('week7_admin_data',{p_section:section});if(result.error)throw Error(result.error.message);return result.data as Row[];}
 if(section==='global-model'){
  if(action!=='update'||!payload||typeof payload!=='object'||Object.keys(payload).some(k=>!['model_id','model_revision'].includes(k))||!Number.isSafeInteger(payload.model_id)||payload.model_id<1||typeof payload.model_revision!=='string'||!/^[a-f0-9]{32}$/.test(payload.model_revision))throw Error('Choose an available model from the list.');
  const [models,providers]=await Promise.all([records('models'),records('providers')]);
  const model=models.find(row=>row.id===payload.model_id),provider=providers.find(row=>row.id===model?.provider_id);
  if(!model||model.revision!==payload.model_revision)throw Error('Model changed. Refresh before switching.');
  if(!model.enabled||!provider)throw Error('Choose an available model.');
  await validateGenerationModel(String(model.identifier),{enabled:provider.enabled,adapter:provider.adapter,credential_env:provider.credential_env});
  const saved=await db.rpc('week7_admin_use_model',{p_model:model.id,p_model_revision:model.revision,p_provider_revision:provider.revision,p_revision:revision});if(saved.error)throw Error(saved.error.message);return Response.json({id:saved.data.model_id},{headers:{'Cache-Control':'private, no-store'}});
 }
 if(section==='models'&&action!=='delete'){
  if(!payload||typeof payload!=='object'||typeof payload.identifier!=='string'||!Number.isSafeInteger(payload.provider_id))throw Error('Enter a model ID and choose a provider.');
  const model=action==='update'?(await records('models')).find(row=>row.id===id):null;
  if(action==='update'&&(!model||model.revision!==revision))throw Error('Model changed. Refresh before saving.');
  if(!model||model.identifier!==payload.identifier||model.provider_id!==payload.provider_id||(!model.enabled&&payload.enabled)){
   const provider=(await records('providers')).find(row=>row.id===payload.provider_id);if(!provider)throw Error('Choose an available Google provider.');
   await validateGenerationModel(payload.identifier,{enabled:provider.enabled,adapter:provider.adapter,credential_env:provider.credential_env});
  }
 }

 if(section==='images'&&action==='delete'){
  const list=await db.rpc('week7_admin_data',{p_section:'images'});if(list.error)throw Error(list.error.message);
  const image=(list.data as {id:number;revision:string;in_use:boolean;bucket:string;path:string}[]).find(r=>r.id===id);
  if(!image||image.revision!==revision)throw Error('Record changed. Refresh before deleting.');if(image.in_use)throw Error('This image is in use. Remove it from the event or profile first.');
  const removed=await db.storage.from(image.bucket).remove([image.path]);if(removed.error)throw Error('Image could not be removed. Please try again.');
 }
 const saved=await db.rpc('week7_admin_save',{p_section:section,p_action:action,p_id:id??null,p_payload:payload??{},p_revision:revision??''});
 if(saved.error)throw Error(saved.error.message);return Response.json({id:saved.data.id},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return errorResponse(e);}}
