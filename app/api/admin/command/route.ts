import {requireAdmin,sameOrigin,errorResponse} from '@/lib/access';
import {parseCommand} from '@/lib/domain';
import {validatePlan} from '@/lib/plan';
import {authClient} from '@/lib/supabase';
import {cleanupImages} from '@/lib/data';
export async function POST(request:Request){try{sameOrigin(request);await requireAdmin();const raw=await request.text();if(raw.length>25000)throw Error('Request is too large.');const command=parseCommand(JSON.parse(raw));if(command.action==='update')command.payload=validatePlan(command.payload);if(command.action!=='cleanup'){const db=await authClient();const {error}=await db.rpc('week6_admin_command',{p_action:command.action,p_gid:command.gid,p_payload:command.action==='host'?{hosting_details:command.hostingDetails}:command.payload??null,p_expected:command.revision,p_reason:command.reason??''});if(error)throw Error(error.message);}if(command.action==='delete'||command.action==='cleanup')await cleanupImages();return Response.json({ok:true},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
