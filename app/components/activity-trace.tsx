/* eslint-disable @next/next/no-img-element -- Images use authenticated admin endpoints. */
'use client';
import Link from 'next/link';
import {Fragment,createContext,useContext,useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {asRecord,inputBreakdown,responseContext,type ActivityTrace} from '@/lib/ai-activity';
import {nameOf,type Admin,type Dataset} from '@/lib/domain';
import {nyDate} from '@/lib/plan';
import type {Row,Week7Data} from '@/lib/week7';
import ImagePlaceholder from './image-placeholder';
import styles from './activity-flow.module.css';

const display=(value:unknown,missing='Not recorded')=>value==null||value===''?missing:String(value);
const serialized=(value:unknown)=>typeof value==='string'?value:JSON.stringify(value,null,2);
const DisclosureContext=createContext(false);
export function Disclosure({title,value,children}:{title:string;value?:unknown;children?:ReactNode}){
 if(value==null&&!children)return null;
 return <details className={styles.disclosure}><summary>{title}</summary><div className={styles.disclosureContent}><DisclosureContext.Provider value={true}>{children??<pre>{serialized(value)}</pre>}</DisclosureContext.Provider></div></details>;
}
function AssetPreview({path,cover}:{path?:string|null;cover?:unknown}){
 const [failed,setFailed]=useState(false),url=path?'/api/admin/image?bucket=week4-event-images&path='+encodeURIComponent(path):typeof cover==='string'?'/api/admin/covers/'+encodeURIComponent(cover):null;
 return <div className={styles.image}>{url&&!failed?<img alt="Activity image" src={url} onError={()=>setFailed(true)}/>:<ImagePlaceholder/>}</div>;
}
export function RawData({value,children}:{value:unknown;children?:ReactNode}){
 const insideDisclosure=useContext(DisclosureContext),[open,setOpen]=useState(false),expanded=insideDisclosure||open;
 if(value===undefined)return <p className={styles.missing}>Not recorded.</p>;
 const full=serialized(value),preview=typeof value==='string'?value.split(/\r?\n/,1)[0]:JSON.stringify(value),canExpand=!insideDisclosure&&(full.includes('\n')||preview.length>20);
 return <div className={styles.rawContainer} style={{position:'relative',minWidth:0,maxWidth:'100%'}}><pre className={`${styles.rawData} ${expanded?styles.rawExpanded:styles.rawPreview}`} style={{whiteSpace:expanded?'pre-wrap':'nowrap',overflow:expanded?'auto':'hidden',textOverflow:expanded?'clip':'ellipsis',maxWidth:'100%',paddingRight:canExpand?36:undefined}}>{children??(expanded?full:preview)}</pre>{canExpand&&<button type="button" className={styles.rawToggle} aria-expanded={expanded} aria-label={expanded?'Collapse raw data':'Expand raw data'} title={expanded?'Collapse':'Expand'} onClick={()=>setOpen(!open)}><svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d={expanded?'M5 12.5 10 7.5l5 5':'M5 7.5 10 12.5l5-5'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></button>}</div>;
}
function Card({number,title,reply=false,input,assembly,output}:{number:number;title:string;reply?:boolean;input?:ReactNode;assembly:ReactNode;output:ReactNode}){
 return <article className={styles.card}><header className={styles.cardHeader}><span className={reply?styles.replyNumber:styles.number}>{number}</span><h3>{title}</h3></header>{input!==undefined&&<section className={styles.input}><div className={styles.ioHeading}><h4>Input data</h4>{number>1&&<span>From Step {number-1} output</span>}</div>{input}</section>}<section className={input===undefined?`${styles.assembly} ${styles.assemblyOnly}`:styles.assembly}><div className={styles.ioHeading}><h4>{input===undefined?'Input data':'Assembly'}</h4></div>{assembly}</section><section className={styles.output}><div className={styles.ioHeading}><h4>Output data</h4></div>{output}</section></article>;
}
export function Addends({items}:{items:ReactNode[]}){return <div className={styles.formula}>{items.map((item,index)=><Fragment key={index}>{index>0&&<span className={styles.plus} aria-hidden="true">+</span>}<div className={styles.addend}>{item}</div></Fragment>)}</div>;}
function ReferencePart({context,kind}:{context:Record<string,unknown>|null;kind:'terms'|'examples'}){
 const label=kind==='terms'?'Terms':'Examples',values=Array.isArray(context?.[kind])?context[kind] as unknown[]:undefined;
 return <Disclosure title={label+(values?' · '+values.length:'')}>{values?.length?values.map((value,index)=>{const item=asRecord(value),title=kind==='terms'?display(item?.term,'Term '+(index+1)):display(item?.title??asRecord(item?.output)?.title,'Example '+(index+1));return <Disclosure key={index} title={title}><RawData value={kind==='terms'&&item?.definition!==undefined?item.definition:value}/></Disclosure>;}):<RawData value={values}/>}</Disclosure>;
}
function UserCard({activity}:{activity:ActivityTrace}){
 const first=activity.responses[0],input=(first?inputBreakdown(activity,first).userInput:null)??activity.generation?.inputs;
 const labels:Record<string,string>={format:'Format',region:'Area',tags:'Interests'};
 return <Card number={1} title="User input" assembly={input?<Addends items={[<Disclosure key="idea" title="Idea"><RawData value={input.idea}/></Disclosure>,...Object.entries(input).filter(([key])=>key!=='idea').map(([key,value])=><Disclosure key={key} title={labels[key]??key}><RawData value={value}/></Disclosure>),...(activity.generation?.image_path?[<Disclosure key="image" title="Image"><AssetPreview path={activity.generation.image_path}/></Disclosure>]:[])]}/>:<p className={styles.missing}>Not recorded.</p>} output={<><RawData value={input}/>{activity.generation?.image_path&&<Disclosure title="Image"><AssetPreview path={activity.generation.image_path}/></Disclosure>}</>}/>;
}
function PromptCard({activity,response,number,chain,previousOutput}:{activity:ActivityTrace;response?:Row;number:number;chain:string;previousOutput?:unknown}){
 const context=response?responseContext(activity,response):asRecord(activity.request.snapshot),input=response?inputBreakdown(activity,response):null,previous=number===2?(input?.userInput??activity.generation?.inputs):previousOutput;
 const rules=input?.applicationRules, instruction=input?.chainInstructions??context?.instructions;
 return <Card number={number} title="Build model input" input={<RawData value={previous}/>} assembly={<Addends items={[
 <Disclosure key="input" title="Input"><RawData value={previous}/></Disclosure>,
 <Disclosure key="rules" title="App rules"><RawData value={rules??undefined}/></Disclosure>,
 <Disclosure key="chain" title={'Chain · '+chain}><RawData value={instruction??undefined}/></Disclosure>,
 <ReferencePart key="terms" context={context} kind="terms"/>,
 <ReferencePart key="examples" context={context} kind="examples"/>
 ]}/>} output={<><RawData value={response?.prompt??undefined}/></>}/>;
}
function ReplyCard({activity,response,number}:{activity:ActivityTrace;response?:Row;number:number}){
 const input=response?inputBreakdown(activity,response):null,output=response?.response_json??response?.response_text??undefined;
 return <Card number={number} title="Model reply" reply input={<><RawData value={response?.prompt??undefined}/></>} assembly={<Disclosure title="Model"><RawData value={input?.role==='user'?{model:response?.model??activity.model,request_role:'user',system_message:null}:response?.model??activity.model}/></Disclosure>} output={<>{response?.error!=null&&<p className={styles.error}>{String(response.error)}</p>}<RawData value={output}/><Disclosure title="Full response" value={response?.raw_response}/></>}/>;
}
export default function ActivityTraceDialog({activity,data,admin,week7,close}:{activity:ActivityTrace;data:Dataset;admin:Admin;week7:Week7Data;close:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),request=activity.request,snapshot=asRecord(request.snapshot),profile=data.profiles.find(person=>person.id===request.user_id),chain=week7.lookups['prompt-chains']?.find(row=>row.id===request.chain_id),chainName=display(snapshot?.chain_name??chain?.name,request.chain_id?'Chain #'+request.chain_id:'Not recorded'),replies=activity.responses.length?activity.responses:[undefined],count=1+replies.length*2;
 useEffect(()=>{const dialog=ref.current,previousOverflow=document.body.style.overflow,previousFocus=document.activeElement;dialog?.showModal();document.body.style.overflow='hidden';return()=>{dialog?.close();document.body.style.overflow=previousOverflow;if(previousFocus instanceof HTMLElement)previousFocus.focus();};},[]);
 return <dialog className={styles.modal} ref={ref} onCancel={event=>{event.preventDefault();close();}} aria-labelledby="trace-title"><header className={styles.header}><div><span className={styles.eyebrow}>REQUEST #{request.id}</span><h2 id="trace-title">{activity.title}</h2><div className={styles.meta}><span className={'badge '+(request.status==='failed'?'danger':request.status==='ready'?'success':'neutral')}>{display(request.status)}</span><Link className={request.user_id===admin.id?'current-admin-name':'text-link'} href={'/users/'+request.user_id}>{nameOf(profile)}</Link><span>{nyDate(String(request.created_at))}</span><span>{request.source==='legacy'?'Earlier version':request.source==='admin'?'Admin':'Campus plans'}</span></div></div><button type="button" className={styles.close} aria-label="Close activity details" onClick={close}>×</button></header><div className={styles.body}>{request.error!=null&&<p className={styles.error}>{String(request.error)}</p>}<div className={styles.flowViewport}><div className={styles.flow} style={{'--stage-count':count,'--flow-min-width':count>3?count*320+'px':'0px'} as CSSProperties}><UserCard activity={activity}/>{replies.map((response,index)=><Fragment key={response?.id??'pending'}><PromptCard activity={activity} response={response} number={index*2+2} chain={chainName} previousOutput={index>0?(activity.responses[index-1]?.response_json??activity.responses[index-1]?.response_text??undefined):undefined}/><ReplyCard activity={activity} response={response} number={index*2+3}/></Fragment>)}</div></div></div><footer className={styles.footer}><button className="button subtle" onClick={close}>Close</button></footer></dialog>;
}
