import type {Row} from './week7';
export function promptPercentages(rows:Row[]):Record<number,number>{
 const total=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.weight)||0),0);
 if(!total)return Object.fromEntries(rows.map(row=>[row.id,0]));
 const parts=rows.map(row=>{const exact=Math.max(0,Number(row.weight)||0)/total*100;return {id:row.id,value:Math.floor(exact),remainder:exact%1};});
 let remaining=100-parts.reduce((sum,row)=>sum+row.value,0);
 for(const part of [...parts].sort((a,b)=>b.remainder-a.remainder||a.id-b.id)){if(remaining--<=0)break;part.value++;}
 return Object.fromEntries(parts.map(part=>[part.id,part.value]));
}
