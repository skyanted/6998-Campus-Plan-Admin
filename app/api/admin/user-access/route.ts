import {requireAdmin,sameOrigin,errorResponse} from '@/lib/access';
import {authClient} from '@/lib/supabase';
export async function POST(request:Request){try{
 sameOrigin(request);await requireAdmin();
 const {userId,enabled,expected}=await request.json();
 if(typeof userId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)||typeof enabled!=='boolean'||typeof expected!=='boolean')throw Error('Invalid permission change.');
 const db=await authClient();const {error}=await db.rpc('week8_admin_set_user_access',{p_user:userId,p_enabled:enabled,p_expected:expected});
 if(error)throw Error(error.message);return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return errorResponse(e);}}
