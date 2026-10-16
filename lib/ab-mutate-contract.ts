import { selectionChannel,selectionId } from '@/lib/ab-selection-contract';
import { abEditorialTitle } from '@/lib/ab-suggestions-contract';
import { observeAbWindows } from '@/lib/ab-observation';
const fields=['id','userId','videoId','originalTitle','variantA','variantB','status','hoursPerVariant','startedAt','switchedAt','completedAt','initialViews','switchViews','endViews','winner'] as const;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const iso=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&Date.parse(v)>=0&&new Date(v).toISOString()===v;
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2147483647;
export type AbMutationSnapshot={id:string;userId:string;videoId:string;originalTitle:string;variantA:string;variantB:string;status:'variant_a'|'variant_b'|'completed';hoursPerVariant:number;startedAt:string;switchedAt:string|null;completedAt:string|null;initialViews:number;switchViews:number|null;endViews:number|null;winner:'A'|'B'|'tie'|null};
// An immutable expectation only vetoes changed data. It never admits a writer.
export function abMutationSnapshot(value:unknown):Readonly<AbMutationSnapshot>{
 if(!object(value))throw Error('invalid_input');const v=value;
 if(Object.keys(v).length!==fields.length||!fields.every(k=>Object.hasOwn(v,k))||!id(v.id)||!id(v.userId)||!selectionId(v.videoId)||!['originalTitle','variantA','variantB'].every(k=>abEditorialTitle(v[k]))||v.variantA===v.variantB||!['variant_a','variant_b','completed'].includes(v.status as string)||typeof v.hoursPerVariant!=='number'||!Number.isInteger(v.hoursPerVariant)||v.hoursPerVariant<12||v.hoursPerVariant>168||!iso(v.startedAt)||!count(v.initialViews)||v.switchedAt!==null&&!iso(v.switchedAt)||v.completedAt!==null&&!iso(v.completedAt)||v.switchViews!==null&&!count(v.switchViews)||v.endViews!==null&&!count(v.endViews)||v.winner!==null&&!['A','B','tie'].includes(v.winner as string))throw Error('invalid_input');
 if(v.status==='variant_a'&&(v.switchedAt!==null||v.completedAt!==null||v.switchViews!==null||v.endViews!==null||v.winner!==null)||v.status==='variant_b'&&(!iso(v.switchedAt)||Date.parse(v.switchedAt)<=Date.parse(v.startedAt)||!count(v.switchViews)||v.switchViews<v.initialViews||v.completedAt!==null||v.endViews!==null||v.winner!==null))throw Error('invalid_input');
 if(v.status==='completed'){const observation=observeAbWindows(v as AbMutationSnapshot);if(!observation||observation.leadingWindow!==v.winner)throw Error('invalid_input');}
 return Object.freeze(Object.fromEntries(fields.map(k=>[k,v[k]]))) as Readonly<AbMutationSnapshot>;
}
export function captureAbMutationTest(value:Record<string,unknown>){return abMutationSnapshot(Object.fromEntries(fields.map(k=>{let v=value[k];if(v!==null&&typeof v!=='string'&&['startedAt','switchedAt','completedAt'].includes(k)){try{v=new Date(Date.prototype.getTime.call(v)).toISOString();}catch{throw Error('invalid_input');}}return[k,v];})));}
export function abNativeMutationInput(value:unknown){if(!object(value)||Object.keys(value).sort().join(',')!=='action,channelId,lang,test'||!selectionChannel(value.channelId)||!['es','en'].includes(value.lang as string)||!['cancel','apply_winner'].includes(value.action as string))throw Error('invalid_input');const test=abMutationSnapshot(value.test);
 if(value.action==='cancel'?test.status==='completed':test.status!=='completed')throw Error('invalid_input');
 return Object.freeze({test,channelId:value.channelId,lang:value.lang as 'es'|'en',action:value.action as 'cancel'|'apply_winner'});
}
