import 'server-only';
import {cache} from 'react';
import {authClient} from './supabase';
import type {Admin} from './domain';
export class AccessError extends Error{constructor(public status:number,message:string){super(message);}}
export const requireAdmin=cache(async ():Promise<Admin>=>{
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)throw new AccessError(503,'Supabase is not configured.');
 const db=await authClient();const {data:{user},error}=await db.auth.getUser();
 if(error||!user)throw new AccessError(401,'Sign in with Google to continue.');
 const {data,error:roleError}=await db.rpc('week6_admin_me');
 if(roleError||!data?.authorized)throw new AccessError(403,'This Google account does not have admin access.');
 return {id:user.id,name:data.name||'Administrator'};
});
export function sameOrigin(request:Request){const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new AccessError(403,'Invalid request origin.');}
export function errorResponse(e:unknown){return Response.json({error:e instanceof Error?e.message:'The request could not be completed.'},{status:e instanceof AccessError?e.status:400,headers:{'Cache-Control':'private, no-store'}});}
