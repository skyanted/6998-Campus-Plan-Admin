import {NextResponse} from 'next/server';
import {sameOrigin,errorResponse} from '@/lib/access';
import {safeReturn} from '@/lib/domain';
export async function POST(request:Request){try{sameOrigin(request);const {next}=await request.json();const response=NextResponse.json({ok:true});response.cookies.set('campus-admin-return-to',safeReturn(typeof next==='string'?next:null),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:1800});return response;}catch(e){return errorResponse(e);}}
