import {NextResponse} from 'next/server';
import {authorizeTrendsCron,refreshTrends} from '@/lib/trends-original';
export const maxDuration=60;
export async function GET(request:Request){
 const original=authorizeTrendsCron(request);if(!original)return NextResponse.json({error:'unauthorized'},{status:401});
 try{const result=await refreshTrends(original);return NextResponse.json({ok:result.errors.length===0,...result},{status:result.errors.length?503:200,headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({ok:false,error:'trends_unconfirmed'},{status:503,headers:{'Cache-Control':'no-store'}});}
}