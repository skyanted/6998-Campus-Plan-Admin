
'use client';
import Link,{useLinkStatus} from 'next/link';
import {groupForSection} from '@/lib/week7';
import {Spinner} from './loading-indicator';
function TabLabel({label}:{label:string}){const {pending}=useLinkStatus();return <>{pending&&<Spinner size={14} label="Loading…"/>}{label}</>;}
export default function SectionTabs({section}:{section:string}){const group=groupForSection(section);if(!group||group.sections.length<2)return null;return <nav className="section-tabs" aria-label={group.label+' sections'}>{group.sections.map(tab=><Link key={tab.key} href={'/'+tab.key} scroll={false} aria-current={section===tab.key||(['prompt-chains','prompt-steps'].includes(section)&&tab.key==='prompt-mix')?'page':undefined}><TabLabel label={tab.label}/></Link>)}</nav>;}
