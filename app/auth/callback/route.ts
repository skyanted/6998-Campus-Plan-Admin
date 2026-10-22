import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {authClient} from '@/lib/supabase';
import {safeReturn} from '@/lib/domain';
export async function GET(request:Request){const url=new URL(request.url),code=url.searchParams.get('code');if(code){const db=await authClient();const {error}=await db.auth.exchangeCodeForSession(code);if(!error){const jar=await cookies(),next=safeReturn(jar.get('campus-admin-return-to')?.value);jar.delete('campus-admin-return-to');const {data}=await db.rpc('week6_admin_me');return NextResponse.redirect(new URL(data?.authorized?next:'/forbidden',url.origin));}}return NextResponse.redirect(new URL('/login?error=callback',url.origin));}
