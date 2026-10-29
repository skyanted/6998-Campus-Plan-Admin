import {requireAdmin,sameOrigin,errorResponse} from '@/lib/access';
import {authClient} from '@/lib/supabase';
export async function POST(request:Request){try{
 sameOrigin(request);await requireAdmin();
 if(Number(request.headers.get('content-length'))>40000)throw Error('The record is too large.');
 const value=await request.json(),{section,action,id,payload,revision}=value;
 if(typeof section!=='string'||!['create','update','delete'].includes(action)||(action!=='create'&&section!=='prompt-traffic'&&(!Number.isSafeInteger(id)||id<1||typeof revision!=='string'||!/^[a-f0-9]{32}$/.test(revision))))throw Error('Invalid request.');
 const db=await authClient();
 if(section==='prompt-traffic'){
  if(action!=='update'||!payload||typeof payload!=='object'||!Array.isArray(payload.rows)||payload.rows.length>100)throw Error('Enter a percentage for each prompt chain.');
  const saved=await db.rpc('week7_admin_set_prompt_mix',{p_rows:payload.rows});if(saved.error)throw Error(saved.error.message);return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }

 if(section==='global-model'){
  if(action!=='update'||!payload||typeof payload!=='object'||Object.keys(payload).some(k=>!['provider_id','identifier'].includes(k))||!Number.isSafeInteger(payload.provider_id)||payload.provider_id<1||typeof payload.identifier!=='string'||!/^[a-zA-Z0-9._-]{1,100}$/.test(payload.identifier.trim()))throw Error('Choose a provider and enter a valid model name.');
  const saved=await db.rpc('week7_admin_set_global_model',{p_provider:payload.provider_id,p_identifier:payload.identifier.trim(),p_revision:revision});if(saved.error)throw Error(saved.error.message);return Response.json({id:saved.data.model_id},{headers:{'Cache-Control':'private, no-store'}});
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
