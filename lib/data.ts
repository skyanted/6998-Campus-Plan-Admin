import 'server-only';
import {promptFor} from './ai';
import {authClient} from './supabase';
import {requireAdmin} from './access';
import type {Dataset,Profile} from './domain';
import {sections,type Row,type Week7Data,type GlobalModel} from './week7';
export async function loadData(path='/'):Promise<Dataset>{
 await requireAdmin();const db=await authClient();
 const loaded=await db.rpc('week6_admin_data');if(loaded.error)throw Error('Admin data could not be loaded.');
 const data={...loaded.data,now:Date.now()} as Dataset;
 async function records(section:string):Promise<Row[]>{const result=await db.rpc('week7_admin_data',{p_section:section});if(result.error)throw Error('The '+section+' records could not be loaded.');return result.data as Row[];}
 const users=await records('users') as unknown as Pick<Profile,'id'|'login_email'|'last_sign_in_at'|'is_superadmin'>[];data.profiles=data.profiles.map((p:Profile)=>({...p,...users.find(r=>String(r.id)===p.id)}));
 const section=path.slice(1);if(sections[section]){
  const promptPage=['prompt-chains','prompt-steps','prompt-mix'].includes(section);
  const refs=['prompt-chains','models','providers',...(promptPage?['prompt-steps','prompt-mix']:[]),...(section==='llm-responses'?['generation-requests']:[])];
  const lookups=Object.fromEntries(await Promise.all(refs.map(async key=>[key,await records(key)])));
  let rows:Row[]=section==='ai-media'?data.generations.map(g=>({...g,title:g.output?.title??'Generation #'+g.id})):await records(section);
  if(section==='images')rows=rows.map(row=>({...row,category:({'week4-avatars':'Profile photo','week4-event-images':'Event photo','week7-admin-images':'Admin upload'} as Record<string,string>)[String(row.bucket)]??'Uploaded image',image_status:row.available?(row.in_use?'In use':'Available'):'Unavailable'}));
  data.week7={section,rows,lookups} as Week7Data;
  if(promptPage){const covers=await db.from('week4_covers').select('id,description,image_path');if(covers.error)throw Error('Prompt cover references could not be loaded.');data.week7.sharedPrompt=promptFor({idea:'{{user idea}}',format:'{{selected format}}',region:'{{selected area}}',tags:['{{selected interests}}']},'{{current time}}',covers.data??[]);}
  if(section==='models'||promptPage){const global=await db.rpc('week7_admin_global_model');if(global.error||!global.data)throw Error('Global model settings could not be loaded.');data.week7.globalModel=global.data as GlobalModel;}
 }
 return data;
}
export async function cleanupImages(){const db=await authClient();const list=await db.rpc('week6_admin_cleanup');if(list.error)return;for(const item of list.data??[]){const removed=await db.storage.from(item.bucket).remove([item.path]);if(!removed.error)await db.rpc('week6_admin_cleanup_done',{item_id:item.id});}}
