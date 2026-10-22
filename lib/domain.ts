import type {Plan} from './plan';
export type Profile={id:string;first_name:string|null;last_name:string|null;email:string|null;bio:string;city:string|null;occupation:string|null;avatar_path:string|null;published:boolean;created_at:string;tags:string[]};
export type Generation={id:number;user_id:string;status:'pending'|'ready'|'failed'|'discarded';inputs:Record<string,unknown>;prompt:string;model:string;output:Plan|null;original_output:Plan|null;image_path:string|null;created_at:string;revision:string};
export type Event=Plan & {id:number;creator_id:string;generation_id:number;image_path:string|null;upvotes:number;downvotes:number;hosting_status:'undecided'|'confirmed'|'cancelled';hosting_details:string|null;confirmed_at:string|null;published_at:string};
export type Vote={event_id:number;user_id:string;value:1|-1;created_at:string};
export type Log={id:number;actor_id:string;action:string;generation_id:number;title:string;reason:string;created_at:string};
export type Dataset={now:number;profiles:Profile[];generations:Generation[];events:Event[];votes:Vote[];history:{user_id:string;event_id:number;upvoted_at:string}[];logs:Log[];stats:{users:number;published:number;generations:number;votes:number};cleanup_count:number};
export type Admin={id:string;name:string};
export const nameOf=(p:Profile|undefined)=>[p?.first_name,p?.last_name].filter(Boolean).join(' ')||'Community member';
export const score=(e:Event)=>e.upvotes-e.downvotes;
export const upcoming=(e:Event,now=Date.now())=>Date.parse(e.starts_at)>now&&e.hosting_status!=='cancelled';
export const ranking=(a:Event,b:Event)=>score(b)-score(a)||b.upvotes-a.upvotes||Date.parse(a.published_at)-Date.parse(b.published_at)||a.id-b.id;
export function safeReturn(value:string|null|undefined){if(!value||value.length>500||/[\\\r\n]/.test(value)||!value.startsWith('/')||value.startsWith('//'))return '/';try{const u=new URL(value,'https://admin.invalid');return u.origin==='https://admin.invalid'&&/^\/(?:events(?:\/new|\/\d+|\/generations\/\d+)?|users(?:\/[a-f0-9-]{36})?|votes)?$/.test(u.pathname)?u.pathname+u.search:'/';}catch{return '/';}}
export type Command={action:'update'|'publish'|'delete'|'cancel'|'host'|'cleanup';gid:number;payload?:Plan;revision:string;reason?:string;hostingDetails?:string};
export function parseCommand(value:unknown):Command{if(!value||typeof value!=='object')throw Error('Invalid request.');const c=value as Command;if(!['update','publish','delete','cancel','host','cleanup'].includes(c.action)||!Number.isSafeInteger(c.gid)||(c.action!=='cleanup'&&c.gid<1)||typeof c.revision!=='string'||c.revision.length>100||(c.reason!==undefined&&(typeof c.reason!=='string'||c.reason.length>500)))throw Error('Check your changes.');if(c.action==='host'&&(typeof c.hostingDetails!=='string'||!c.hostingDetails.trim()||c.hostingDetails.length>3000))throw Error('Add hosting details, up to 3,000 characters.');return c;}
