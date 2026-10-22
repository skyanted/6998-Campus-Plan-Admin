import {NextResponse} from 'next/server';
import {sameOrigin,errorResponse} from '@/lib/access';
import {authClient} from '@/lib/supabase';
export async function POST(request:Request){try{sameOrigin(request);const db=await authClient();await db.auth.signOut({scope:'local'});return NextResponse.redirect(new URL('/login',request.url),303);}catch(e){return errorResponse(e);}}
