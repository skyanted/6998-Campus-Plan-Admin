import {redirect} from 'next/navigation';
import {requireAdmin,AccessError} from '@/lib/access';
import Editor from './studio';
import './editor.css';
export default async function Page(){let admin;try{admin=await requireAdmin();}catch(e){if(e instanceof AccessError)redirect(e.status===401?'/login?next=%2Fchains':'/forbidden');throw e;}return <div className="chain-workbench"><Editor name={admin.name}/></div>;}
