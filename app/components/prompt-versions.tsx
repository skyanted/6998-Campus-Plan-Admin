'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {useState,useTransition,type FormEvent} from 'react';
import type {Week7Data} from '@/lib/week7';
import {promptPercentages} from '@/lib/prompt-traffic';
import {Spinner} from './loading-indicator';

export default function PromptVersions({week7}:{week7:Week7Data}){
 const router=useRouter(),chains=week7.lookups['prompt-chains']??[],steps=week7.lookups['prompt-steps']??[],mix=week7.lookups['prompt-mix']??[];
 const initial=promptPercentages(mix),active=mix.filter(row=>Number(row.weight)>0);
 const[selected,setSelected]=useState(active.length===1?String(active[0].chain_id):'custom'),[values,setValues]=useState<Record<number,string>>(()=>Object.fromEntries(mix.map(row=>[row.id,String(initial[row.id]??0)]))),[pending,setPending]=useState(false),[refreshing,startRefresh]=useTransition(),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const busy=pending||refreshing,total=Object.values(values).reduce((sum,value)=>sum+Number(value),0),valid=total===100&&Object.values(values).every(v=>/^\d+$/.test(v)&&Number(v)>=0&&Number(v)<=100);
 const chosen=chains.find(chain=>String(chain.id)===selected);
 function choose(value:string){setSelected(value);setNotice('');if(value!=='custom')setValues(Object.fromEntries(mix.map(row=>[row.id,String(row.chain_id)===value?'100':'0'])));}
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy||!valid)return;setPending(true);setError('');setNotice('');try{
  const response=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section:'prompt-traffic',action:'update',payload:{rows:mix.map(row=>({id:row.id,weight:Number(values[row.id]),revision:row.revision}))}})});
  const result=await response.json();if(!response.ok)throw Error(result.error);setNotice('Prompt settings saved. Applies to new generations in Campus plans and Admin.');startRefresh(()=>router.refresh());
 }catch(e){setError(e instanceof Error?e.message:'Unable to save prompt settings.');}finally{setPending(false);}}
 return <><section className="panel prompt-setup"><h2>Which prompt should generate new activities?</h2><form onSubmit={save} className="form-stack"><label>Prompt<select value={selected} disabled={busy} onChange={e=>choose(e.target.value)}>{chains.map(chain=><option key={chain.id} value={chain.id}>{String(chain.name)}</option>)}<option value="custom">Custom usage split · advanced</option></select></label>{chosen&&<p className="prompt-choice-description">{String(chosen.description)}</p>}{selected==='custom'&&<div className="prompt-split-fields"><p>Share new generations between chains. Percentages must add up to 100.</p>{mix.map(row=><label key={row.id}><span>{String(chains.find(chain=>chain.id===row.chain_id)?.name??'Prompt chain')}</span><span><input type="number" min={0} max={100} step={1} required value={values[row.id]??'0'} disabled={busy} onChange={e=>setValues({...values,[row.id]:e.target.value})}/>%</span></label>)}<span className={'badge '+(valid?'success':'warm')}>{Number.isFinite(total)?total:0}% / 100%</span></div>}{error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="prompt-saved" role="status">{notice}</p>}<div className="prompt-setup-footer"><span>Applies to new generations in both apps.</span><button className="button primary" disabled={busy||!valid} aria-busy={busy}>{busy?<Spinner size={16}/>:<span aria-hidden="true">✓</span>}Save</button></div></form></section>
  <details className="panel prompt-reference" open={week7.section!=='prompt-mix'}><summary>View prompt chains and steps <span>Read only</span></summary><p>A prompt chain is a sequence of AI requests. The current Campus Plans chains each use one request.</p>{chains.map(chain=><section className="prompt-reference-chain" key={chain.id}><h3>{String(chain.name)}</h3><p>{String(chain.description)}</p><ol className="prompt-step-list">{steps.filter(step=>step.chain_id===chain.id).sort((a,b)=>Number(a.position)-Number(b.position)).map(step=><li key={step.id}><span className="prompt-step-number">{String(step.position)}</span><div><h3>{String(step.name)}</h3><p>{String(step.instructions)}</p></div></li>)}</ol></section>)}{week7.sharedPrompt&&<details className="shared-prompt"><summary>Shared instructions</summary><pre>{week7.sharedPrompt}</pre></details>}</details>
  <p className="prompt-model-note">{week7.globalModel&&<>Model: <strong>{week7.globalModel.identifier}</strong>. </>}<Link className="text-link" href="/models">Model settings →</Link></p>
 </>;
}
