'use client';
import {useState,type FormEvent} from 'react';
import {RULE_VARIABLES} from '@/lib/prompt-rules';
import {Spinner} from './loading-indicator';
import styles from './prompt-setup.module.css';
export default function AppRulesEditor({template,revision,onBusy,saved,close}:{template:string;revision?:string;onBusy:(busy:boolean)=>void;saved:()=>void;close:()=>void}){
 const [value,setValue]=useState(template),[pending,setPending]=useState(false),[error,setError]=useState('');
 const valid=Boolean(value.trim())&&value.length<=10000&&RULE_VARIABLES.every(variable=>value.includes(variable));
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();if(pending||!valid||!revision)return;setPending(true);onBusy(true);setError('');try{const response=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({section:'app-rules',action:'update',id:1,revision,payload:{template:value}})});const result=await response.json();if(!response.ok)throw Error(result.error);saved();}catch(e){setError(e instanceof Error?e.message:'Unable to save app rules.');}finally{setPending(false);onBusy(false);}}
 return <form onSubmit={save}><div className="modal-body form-stack"><label>App rules<textarea className={styles.rulesEditor} aria-label="App rules" value={value} maxLength={10000} rows={18} spellCheck={false} disabled={pending} onChange={event=>setValue(event.target.value)}/></label><p className={styles.muted}>Keep these variables: {RULE_VARIABLES.map(variable=><code key={variable}>{variable} </code>)}</p>{!revision&&<p className="error" role="alert">App rules could not be loaded. Refresh before editing.</p>}{error&&<p className="error" role="alert">{error}</p>}</div><div className="modal-footer"><button type="button" className="button subtle" disabled={pending} onClick={close}>Cancel</button><button className="button primary" disabled={pending||!valid||!revision||value===template}>{pending?<Spinner size={16}/>:<span>✓</span>}Save app rules</button></div></form>;
}
