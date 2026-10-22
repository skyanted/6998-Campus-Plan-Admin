import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {requireAdmin,errorResponse} from '@/lib/access';
import {TAGS} from '@/lib/plan';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAdmin();const {id}=await params;if(!TAGS.some(t=>t.slug===id))return new Response('Not found',{status:404});const bytes=await readFile(join(process.cwd(),'assets/week4-covers',id+'.jpg'));return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return errorResponse(e);}}
