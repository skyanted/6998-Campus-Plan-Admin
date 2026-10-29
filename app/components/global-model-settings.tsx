'use client';
import {useState,useTransition,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
import type {GlobalModel,Row} from '@/lib/week7';
import {Spinner} from './loading-indicator';

export default function GlobalModelSettings({settings,providers,models,onSaved}:{settings:GlobalModel;providers:Row[];models:Row[];onSaved:(message:string)=>void}){
 const router=useRouter();
 const[provider,setProvider]=useState(String(settings.provider_id)),[model,setModel]=useState(settings.identifier),[pending,setPending]=useState(false),[refreshing,startRefresh]=useTransition(),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const busy=pending||refreshing;
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setPending(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section:'global-model',action:'update',id:1,revision:settings.revision,payload:{provider_id:Number(provider),identifier:model.trim()}})});
   const result=await response.json();if(!response.ok)throw Error(result.error);
   onSaved('Global model saved. New generations in Campus plans and Admin will use this model.');startRefresh(()=>router.refresh());
  }catch(e){setError(e instanceof Error?e.message:'Unable to save the global model.');}finally{setPending(false);}
 }
 return <section className="panel global-model-panel">
  <div className="panel-heading"><div><h2>Global generation model</h2><p>Used by Campus plans and Admin. Changes apply to new generations.</p></div><span className="badge warm">Global</span></div>
  <form onSubmit={save} className="global-model-form form-stack">
   <fieldset disabled={busy} className="form-grid">
    <label>Provider<select required value={provider} onChange={e=>{setProvider(e.target.value);setNotice('');}}>{providers.filter(p=>p.enabled&&p.adapter==='gemini').map(p=><option key={p.id} value={p.id}>{String(p.name)} · Google</option>)}</select></label>
    <label>Model name<input required maxLength={100} pattern="[a-zA-Z0-9._-]+" list="global-model-names" value={model} onChange={e=>{setModel(e.target.value);setNotice('');}} autoComplete="off" spellCheck={false} placeholder="gemini-3.5-flash-lite"/><datalist id="global-model-names">{models.filter(m=>m.enabled&&String(m.provider_id)===provider).map(m=><option key={m.id} value={String(m.identifier)}/>)}</datalist></label>
   </fieldset>
   {error&&<p className="error small" role="alert">{error}</p>}{notice&&<p className="small" role="status">{notice}</p>}
   <div className="global-model-footer"><span className="small muted">Google is currently the supported provider.</span><button className="button primary" disabled={busy} aria-busy={busy}>{busy?<Spinner size={16}/>:<span aria-hidden="true">✓</span>}Save global model</button></div>
  </form>
 </section>;
}
