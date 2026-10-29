import type {Row} from './week7';
export type SearchSpec={placeholder:string;fields:string[];people?:string[];refs?:Record<string,string>;activity?:boolean};
export type SearchContext={profiles:{id:string;first_name:string|null;last_name:string|null;email:string|null;login_email?:string|null}[];generations:{id:number;output:{title:string}|null;inputs:Record<string,unknown>}[];events:{generation_id:number;title:string}[];lookups:Record<string,Row[]>};
export function rowMatchesSearch(row:Row,query:string,spec:SearchSpec,context:SearchContext){
 const terms=query.trim().toLowerCase().replace(/(^|\s)#(?=\d)/g,'$1').split(/\s+/).filter(Boolean);if(!terms.length)return true;
 const values=spec.fields.map(key=>{const value=row[key];if(key==='output'&&value&&typeof value==='object'){const output=value as {title?:string;description?:string};return [output.title,output.description].filter(Boolean).join(' ');}return value==null?'':String(value);});
 for(const key of spec.people??[]){const person=context.profiles.find(p=>p.id===row[key]);if(person)values.push([person.first_name,person.last_name,person.login_email,person.email].filter(Boolean).join(' '));}
 for(const [key,section] of Object.entries(spec.refs??{})){const ref=context.lookups[section]?.find(r=>r.id===row[key]);if(ref)values.push(String(ref.name??''));}
 if(spec.activity){const generation=context.generations.find(g=>g.id===row.generation_id);const event=context.events.find(e=>e.generation_id===row.generation_id);values.push(event?.title??generation?.output?.title??'',String(generation?.inputs.idea??''));}
 const haystack=values.join(' ').toLowerCase();return terms.every(term=>haystack.includes(term));
}
