import {redirect,notFound} from 'next/navigation';
import {requireAdmin,AccessError} from '@/lib/access';
import {loadData} from '@/lib/data';
import AdminApp from '../components/admin-app';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{page?:string[]}>}){const segments=(await params).page??[];const path='/'+segments.join('/');if(!/^\/(?:events(?:\/new|\/\d+|\/generations\/\d+)?|users(?:\/[a-f0-9-]{36})?|votes)?$/.test(path))notFound();let admin;try{admin=await requireAdmin();}catch(e){if(e instanceof AccessError){if(e.status===401||e.status===503)redirect('/login?next='+encodeURIComponent(path));redirect('/forbidden');}throw e;}const data=await loadData();if(/^\/events\/\d+$/.test(path)&&!data.events.some(e=>e.id===Number(segments[1])))notFound();if(segments[1]==='generations'&&!data.generations.some(g=>g.id===Number(segments[2])))notFound();if(segments[0]==='users'&&segments[1]&&!data.profiles.some(p=>p.id===segments[1]))notFound();return <AdminApp key={path} admin={admin} data={data} path={path} now={data.now}/>;}
