'use client';
import {useRouter} from 'next/navigation';
import {useEffect,useRef,useState,useTransition,type FormEvent,type ReactNode} from 'react';
import type {Week7Data} from '@/lib/week7';
import type {Dataset} from '@/lib/domain';
import {stepMessages} from '@/lib/chain-messages';
import {promptInputTemplate} from '@/lib/prompt-config';
import {Addends,RawData} from './activity-trace';
import PromptCatalog from './prompt-catalog';
import AppRulesEditor from './app-rules-editor';
import {Spinner} from './loading-indicator';
import styles from './prompt-setup.module.css';

type Panel='input'|'rules'|'chain'|'terms'|'examples';
function PromptDialog({title,busy,close,children}:{title:string;busy:boolean;close:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current,overflow=document.body.style.overflow,focus=document.activeElement;dialog?.showModal();document.body.style.overflow='hidden';return()=>{dialog?.close();document.body.style.overflow=overflow;if(focus instanceof HTMLElement)focus.focus();};},[]);
 return <dialog ref={ref} className={'modal '+styles.dialog} aria-labelledby="prompt-dialog-title" onCancel={event=>{event.preventDefault();if(!busy)close();}}><header className="modal-heading"><h2 id="prompt-dialog-title">{title}</h2><button type="button" className="icon-button" disabled={busy} aria-label="Close prompt panel" onClick={close}>×</button></header>{children}</dialog>;
}
function ChainSettings({week7,saved,onBusy,disabled}:{week7:Week7Data;saved:()=>void;onBusy:(busy:boolean)=>void;disabled:boolean}){
 const chains=week7.lookups['prompt-chains']??[],mix=week7.lookups['prompt-mix']??[];
 const [selected,setSelected]=useState(String(mix.find(row=>Number(row.weight)>0)?.chain_id??'')),[pending,setPending]=useState(false),[error,setError]=useState('');
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();setPending(true);onBusy(true);try{const response=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section:'prompt-traffic',action:'update',payload:{rows:mix.map(row=>({id:row.id,weight:String(row.chain_id)===selected?100:0,revision:row.revision}))}})});const result=await response.json();if(!response.ok)throw Error(result.error);saved();}catch(e){setError(e instanceof Error?e.message:'Unable to save.');}finally{setPending(false);onBusy(false);}}
 return <form onSubmit={save}><div className="modal-body form-stack"><label>Current chain<select value={selected} disabled={pending||disabled} onChange={e=>setSelected(e.target.value)}>{chains.map(c=><option key={c.id} value={c.id}>{String(c.name)}</option>)}</select></label>{error&&<p className="error">{error}</p>}<a href="https://6998-campus-plan-studio.vercel.app" target="_blank" rel="noreferrer" className="text-link">Edit chains in Studio ↗</a></div><div className="modal-footer"><button className="button primary" disabled={pending||disabled||!selected}>{pending&&<Spinner size={16}/>}Save</button></div></form>;
}
export default function PromptVersions({week7,data}:{week7:Week7Data;data:Dataset}){
 const router=useRouter(),[panel,setPanel]=useState<Panel|null>(()=>week7.section==='prompt-chains'||week7.section==='prompt-steps'?'chain':null),[busy,setBusy]=useState(false),[refreshing,startRefresh]=useTransition(),[notice,setNotice]=useState('');
 const shared=week7.sharedPrompt??'',input=promptInputTemplate(shared),chains=week7.lookups['prompt-chains']??[],steps=week7.lookups['prompt-steps']??[],mix=week7.lookups['prompt-mix']??[],active=mix.filter(row=>Number(row.weight)>0);
 const activeChains=chains.filter(chain=>active.some(row=>row.chain_id===chain.id)),chainLabel=activeChains.length===1?String(activeChains[0].name):'Custom split';
 const templates=activeChains.flatMap(chain=>steps.filter(row=>row.chain_id===chain.id).sort((a,b)=>Number(a.position)-Number(b.position)).map((step,index)=>{
  const assembly=step.assembly as {rules:string;terms:unknown[];examples:unknown[];covers:unknown[]}|null;
  const previous=index?'{{previous_step_output}}':JSON.stringify(input);
  const message=stepMessages({instructions:String(step.instructions),assembly},previous,'{{current_time}}',JSON.stringify(input));
  return {name:String(step.name),index,assembly,instructions:String(step.instructions),previous,prompt:message.system?JSON.stringify(message,null,2):message.user};
 }));
 function saved(){setPanel(null);setNotice('Saved. New generations use this configuration.');startRefresh(()=>router.refresh());}
 const titles:Record<Panel,string>={input:'Input',rules:'App rules',chain:'Current chain',terms:'Terms',examples:'Examples'};
 return <><div className={styles.chainToolbar}><button className="button subtle" onClick={()=>setPanel('chain')}>{chainLabel} · Change</button><div><button className="button subtle" onClick={()=>setPanel('rules')}>App rules</button> <button className="button subtle" onClick={()=>setPanel('terms')}>Terms</button> <button className="button subtle" onClick={()=>setPanel('examples')}>Examples</button></div></div>{templates.map(template=><article className={styles.card} key={template.index} style={{marginTop:20}}><header className={styles.cardHeader}><span className={styles.number}>{template.index+1}</span><h2>{template.name}</h2><a className={styles.modelLink} href="https://6998-campus-plan-studio.vercel.app" target="_blank" rel="noreferrer">Edit in Studio ↗</a></header><section className={styles.section}><h3>Input data</h3><RawData value={template.index?template.previous:input}/></section><section className={styles.section}><h3>Assembly</h3><Addends items={[
 <details key="input"><summary>Input</summary><RawData value={template.index?template.previous:input}/></details>,
 <details key="instructions"><summary>Step instructions</summary><RawData value={template.instructions}/></details>,
 <details key="rules"><summary>App rules</summary><RawData value={template.assembly?.rules||'None'}/></details>,
 <details key="terms"><summary>Terms · {template.assembly?.terms.length??0}</summary><RawData value={template.assembly?.terms??[]}/></details>,
 <details key="examples"><summary>Examples · {template.assembly?.examples.length??0}</summary><RawData value={template.assembly?.examples??[]}/></details>
 ]}/></section><section className={styles.section}><div className={styles.outputHeading}><h3>Model input</h3><span>Template</span></div><RawData value={template.prompt}/></section></article>)}{notice&&<p className={styles.notice} role="status">{notice}</p>}{panel&&<PromptDialog title={titles[panel]} busy={busy||refreshing} close={()=>{if(!busy)setPanel(null);}}>{panel==='chain'?<ChainSettings key={(week7.lookups['prompt-chains']??[]).map(row=>row.id).join(',')} week7={week7} saved={saved} onBusy={setBusy} disabled={refreshing}/>:panel==='rules'?<AppRulesEditor blocks={week7.ruleBlocks??[]} revision={week7.rulesRevision} onBusy={setBusy} saved={saved} close={()=>setPanel(null)}/>:panel==='terms'||panel==='examples'?<PromptCatalog key={panel} section={panel} rows={week7.lookups[panel]??[]} data={data} onBusy={setBusy}/>:<><div className="modal-body"><pre className={styles.fullText}>{JSON.stringify(input,null,2)}</pre></div><div className="modal-footer"><button className="button subtle" onClick={()=>setPanel(null)}>Close</button></div></>}</PromptDialog>}</>;
}
