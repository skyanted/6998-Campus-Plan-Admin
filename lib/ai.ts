import 'server-only';
import type {Plan} from './plan';
export {promptFor} from './prompt-rules';
export async function resolvePlace(plan:Plan):Promise<Plan>{
 const key=process.env.GOOGLE_MAPS_API_KEY;
 if(plan.format==='online')return plan;
 if(!key)throw new Error('Location lookup is not connected yet. Online activities can still be generated.');
 const res=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress'},body:JSON.stringify({textQuery:plan.location,locationBias:{circle:{center:{latitude:40.8075,longitude:-73.9626},radius:15000}}}),signal:AbortSignal.timeout(8000),cache:'no-store'});
 if(!res.ok)throw new Error('Map lookup is unavailable. Please try again.');
 const data=await res.json();const place=data.places?.[0];if(!place?.id)throw new Error('No matching map venue was found. Please generate another idea.');
 return {...plan,place_id:place.id,location:`${place.displayName.text}, ${place.formattedAddress}`.slice(0,200)};
}
