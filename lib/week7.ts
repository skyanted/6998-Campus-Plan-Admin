export type Row={id:number;revision?:string;[key:string]:unknown};
export type GlobalModel={model_id:number;provider_id:number;identifier:string;provider:string;revision:string;updated_at:string};
export type Week7Data={appRules?:{template:string;revision:string};activity?:import('./ai-activity').ActivityTrace[];sharedPrompt?:string;globalModel?:GlobalModel;section:string;rows:Row[];lookups:Record<string,Row[]>};
export type Field={key:string;label:string;type?:'text'|'textarea'|'number'|'boolean'|'json'|'select';required?:boolean;max?:number;options?:string[];reference?:string};
export type Section={title:string;columns:string[];fields?:Field[];updateOnly?:boolean;description?:string};
const enabled:Field={key:'enabled',label:'Enabled',type:'boolean'};
export const sections:Record<string,Section>={
 'prompt-chains':{title:'Prompt chains',columns:['name','description']},
 'prompt-steps':{title:'Prompt chain steps',columns:['chain_id','position','name','instructions']},
 'prompt-mix':{title:'Prompt chain mix',description:'Choose the percentage of new generations assigned to each prompt chain.',columns:['chain_id','weight'],updateOnly:true,fields:[{key:'weight',label:'Weight',type:'number',required:true,max:10000}]},
 terms:{title:'Terms',description:'Define names or concepts the AI should understand, such as campus locations. Enabled terms are included in new requests.',columns:['term','definition','enabled'],fields:[{key:'term',label:'Term',required:true,max:100},{key:'definition',label:'Meaning for the AI',type:'textarea',required:true,max:2000},enabled]},
 examples:{title:'AI generation examples',description:'Choose a good existing activity as a reference answer for a sample user request. Enabled examples guide future AI output.',columns:['title','input','enabled'],fields:[{key:'title',label:'Title',required:true,max:120},{key:'input',label:'Example input',type:'textarea',required:true,max:2000},{key:'output',label:'Example activity · JSON',type:'json',required:true},enabled]},
 models:{title:'LLM models',columns:['name','provider_id','identifier','model_status'],fields:[{key:'name',label:'Name',required:true,max:100},{key:'provider_id',label:'Provider',type:'select',reference:'providers',required:true},{key:'identifier',label:'Model identifier',required:true,max:100},enabled]},
 providers:{title:'LLM providers',description:'Credentials stay on the server. Google Gemini is the connected provider adapter.',columns:['name','adapter','credential_env','enabled'],fields:[{key:'name',label:'Name',required:true,max:100},{key:'adapter',label:'Adapter',type:'select',options:['gemini'],required:true},{key:'credential_env',label:'Credential',type:'select',options:['GEMINI_API_KEY','GOOGLE_API_KEY'],required:true},enabled]},
 'signup-domains':{title:'Allowed signup domains',description:'New users can join with an enabled domain or a whitelisted email. Existing users keep access.',columns:['domain','enabled','created_at'],fields:[{key:'domain',label:'Domain',required:true,max:253},enabled]},
 'whitelisted-emails':{title:'Whitelisted emails',columns:['email','enabled','created_at'],fields:[{key:'email',label:'Email address',required:true,max:254},enabled]},
 'generation-requests':{title:'Generation requests',columns:['generation_id','user_id','chain_id','source','status','created_at']},
 'llm-responses':{title:'LLM responses',description:'Older generations have saved outputs only. Full responses and timing are recorded for new requests.',columns:['request_id','model','source','latency_ms','http_status','error','created_at']},
 images:{title:'Uploaded images',description:'User avatars, event photos and admin uploads.',columns:['preview','label','category','created_by'],fields:[{key:'label',label:'Name',required:true,max:120},{key:'alt_text',label:'Description',type:'textarea',max:500}]},
 'ai-media':{title:'AI generated media',columns:['title','status','user_id','model','created_at']}
};
export const labels:Record<string,string>={label:'Name',model_status:'Status',input:'Sample request',definition:'Meaning',created_by:'Uploaded by',category:'Type',image_status:'Status',chain_id:'Prompt chain',model_id:'Model',provider_id:'Provider',user_id:'User',generation_id:'Generation',request_id:'Request',credential_env:'Credential',latency_ms:'Time · ms',http_status:'HTTP status',in_use:'In use',alt_text:'Description',created_at:'Created',completed_at:'Completed',response_text:'Response text',response_json:'Parsed response',raw_response:'Raw response'};
export const labelFor=(key:string)=>labels[key]??key.replaceAll('_',' ').replace(/^./,x=>x.toUpperCase());

export type WorkspaceGroup={key:string;label:string;href:string;icon:'image'|'activity'|'spark'|'settings';sections:{key:string;label:string}[]};
export const workspaceGroups:WorkspaceGroup[]=[
 {key:'uploads',label:'Uploads',href:'/images',icon:'image',sections:[{key:'images',label:'Images'}]},
 {key:'activity',label:'AI activity',href:'/generation-requests',icon:'activity',sections:[{key:'generation-requests',label:'AI activity'}]},
 {key:'prompts',label:'Prompts',href:'/prompt-mix',icon:'spark',sections:[{key:'prompt-mix',label:'Setup'},{key:'terms',label:'Terms'},{key:'examples',label:'Examples'}]},
 {key:'settings',label:'Settings',href:'/models',icon:'settings',sections:[{key:'models',label:'Models'},{key:'providers',label:'Providers'},{key:'signup-domains',label:'Signup domains'},{key:'whitelisted-emails',label:'Email whitelist'}]}
];
export const groupForSection=(section:string)=>workspaceGroups.find(group=>group.sections.some(item=>item.key===section)||(['prompt-chains','prompt-steps'].includes(section)&&group.key==='prompts')||(section==='llm-responses'&&group.key==='activity'));

export const sectionSearch:Record<string,import('./admin-search').SearchSpec>={
 "images": {
  "placeholder": "Search image names, types or uploaders…",
  "fields": [
   "label",
   "alt_text",
   "category"
  ],
  "people": [
   "created_by"
  ]
 },
 "models": {
  "placeholder": "Search model names, model IDs or providers…",
  "fields": [
   "name",
   "identifier"
  ],
  "refs": {
   "provider_id": "providers"
  }
 },
 "providers": {
  "placeholder": "Search provider names…",
  "fields": [
   "name"
  ]
 },
 "signup-domains": {
  "placeholder": "Search allowed signup domains…",
  "fields": [
   "domain"
  ]
 },
 "whitelisted-emails": {
  "placeholder": "Search whitelisted email addresses…",
  "fields": [
   "email"
  ]
 },
 "terms": {
  "placeholder": "Search terms or definitions…",
  "fields": [
   "term",
   "definition"
  ]
 },
 "examples": {
  "placeholder": "Search example names, requests or activities…",
  "fields": [
   "title",
   "input",
   "output"
  ]
 },
 "generation-requests": {
  "placeholder": "Search request IDs, activity titles or users…",
  "fields": [
   "id",
   "generation_id",
   "status",
   "source"
  ],
  "people": [
   "user_id"
  ],
  "activity": true
 },
 "llm-responses": {
  "placeholder": "Search request IDs, models or response text…",
  "fields": [
   "request_id",
   "model",
   "response_text",
   "error"
  ]
 },
 "ai-media": {
  "placeholder": "Search activity titles or creators…",
  "fields": [
   "title"
  ],
  "people": [
   "user_id"
  ]
 }
};

export const createLabels:Record<string,string>={terms:'Add term',examples:'Add example',models:'Add model',providers:'Add provider','signup-domains':'Add domain','whitelisted-emails':'Add email'};
