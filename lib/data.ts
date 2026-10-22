import 'server-only';
import {authClient} from './supabase';
import {requireAdmin} from './access';
import type {Dataset} from './domain';
export async function loadData():Promise<Dataset>{await requireAdmin();const db=await authClient();const {data,error}=await db.rpc('week6_admin_data');if(error)throw Error('Admin data could not be loaded. Check that the Week 6 migration is installed.');return {...data,now:Date.now()} as Dataset;}
export async function cleanupImages(){const db=await authClient();const list=await db.rpc('week6_admin_cleanup');if(list.error)return;for(const item of list.data??[]){const removed=await db.storage.from(item.bucket).remove([item.path]);if(!removed.error)await db.rpc('week6_admin_cleanup_done',{item_id:item.id});}}
