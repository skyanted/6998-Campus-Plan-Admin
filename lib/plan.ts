export const TAGS = [{slug:'food',label:'Food'},{slug:'arts',label:'Arts'},{slug:'outdoors',label:'Outdoors'},{slug:'sports',label:'Sports'},{slug:'gaming',label:'Gaming'},{slug:'music',label:'Music'},{slug:'city',label:'City'},{slug:'study',label:'Study'}];
export type Cover={id:string;description:string;image_path:string};
export type Plan={cover_id?:string;place_id?:string;title:string;description:string;format:'in_person'|'online';location:string;starts_at:string;duration_minutes:number;budget:number;capacity:number;tags:string[]};
export type Member={id:string;first_name:string|null;last_name:string|null;email:string|null;bio:string;occupation:string|null;city:string|null;avatar_path:string|null;published:boolean;tags?:string[]};
export type Event=Omit<Plan,'tags'> & {id:number;creator_id:string;generation_id:number;round_id:number|null;image_path:string|null;upvotes:number;downvotes:number;confirmed_at:string|null;hosting_details:string|null;published_at:string;tags:string[];hosting_status:'undecided'|'confirmed'|'cancelled';wasUpvoted:boolean;creator:string;imageUrl:string|null;myVote:number};
export type Generation={id:number;round_id?:number|null;output:Plan|null;status:string;created_at:string;image_path:string|null};
// Assemble display text explicitly: Intl punctuation differs between Node and browsers.
export function nyDate(date:string){
 const wall=nyInput(date),[calendar,time]=wall.split('T');
 const [,month,day]=calendar.split('-').map(Number),[hour,minute]=time.split(':').map(Number);
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const utcMinute=Math.floor(Date.parse(date)/60000)*60000;
 const offsetMinutes=(Date.parse(wall+'Z')-utcMinute)/60000;
 const zone=offsetMinutes===-240?'EDT':'EST';
 return `${months[month-1]} ${day}, ${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'} ${zone}`;
}
export function nyInput(date:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date));
 const get=(key:string)=>parts.find(p=>p.type===key)?.value;
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
// Interpret the form's wall clock in New York, regardless of the user's browser timezone.
export function nyToISO(value:string){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a valid date and time.');
 let utc=Date.parse(value+'Z');
 for(let i=0;i<3;i++) utc+=Date.parse(value+'Z')-Date.parse(nyInput(new Date(utc).toISOString())+'Z');
 const result=new Date(utc).toISOString();
 if(nyInput(result)!==value) throw new Error('That time does not exist in New York. Choose another time.');
 return result;
}
export const eventEnd=(event:{starts_at:string;duration_minutes:number})=>Date.parse(event.starts_at)+event.duration_minutes*60000;
export function eventPhase(event:Pick<Event,'starts_at'|'duration_minutes'|'hosting_status'>,now:number){
 if(event.hosting_status==='cancelled')return 'Cancelled';
 if(now>=eventEnd(event))return 'Previous';
 return now>=Date.parse(event.starts_at)?'Ongoing':'Upcoming';
}
export function popularOrder(a:Event,b:Event){return (b.upvotes-b.downvotes)-(a.upvotes-a.downvotes)||b.upvotes-a.upvotes||Date.parse(a.published_at)-Date.parse(b.published_at)||a.id-b.id;}
export function validatePlan(value:unknown):Plan{
 if(!value||typeof value!=='object')throw new Error('AI returned an invalid activity. Please regenerate.');
 const p=value as Plan;
 for(const [key,max] of [['title',120],['description',5000],['location',200]] as const){if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>max)throw new Error('AI returned incomplete activity details. Please regenerate.');}
 if(!['in_person','online'].includes(p.format)||!Number.isInteger(p.duration_minutes)||p.duration_minutes<15||p.duration_minutes>480||!Number.isInteger(p.capacity)||p.capacity<2||p.capacity>200||!Number.isFinite(p.budget)||p.budget<0||p.budget>1000||!Array.isArray(p.tags)||p.tags.length>3||new Set(p.tags).size!==p.tags.length||p.tags.some(t=>!TAGS.some(x=>x.slug===t))||!Number.isFinite(Date.parse(p.starts_at))||!/(Z|[+-]\d\d:\d\d)$/.test(p.starts_at))throw new Error('AI returned an invalid activity. Please regenerate.');
 return p;
}
