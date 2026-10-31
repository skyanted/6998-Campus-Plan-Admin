'use client';
import {Spinner} from './loading-indicator';
import styles from './enabled-toggle.module.css';
export default function EnabledToggle({label,enabled,disabled,pending,onChange}:{label:string;enabled:boolean;disabled?:boolean;pending?:boolean;onChange:()=>void}){
 return <button type="button" role="switch" aria-checked={enabled} aria-label={'Use '+label+' in new generations'} aria-busy={pending} disabled={disabled} className={styles.toggle} onClick={onChange}><span className={styles.track} data-enabled={enabled}><span className={styles.thumb}>{pending&&<Spinner size={11}/>}</span></span><span>{enabled?'Enabled':'Disabled'}</span></button>;
}
