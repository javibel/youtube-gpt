import {NextResponse} from 'next/server';
import {authorizeSnapshotsCron,refreshSnapshots} from '@/lib/snapshots-original';
export const maxDuration=60;
export async function GET(request:Request){
 const original=authorizeSnapshotsCron(request);if(!original)return NextResponse.json({error:'unauthorized'},{status:401});
 try{const result=await refreshSnapshots(original);return NextResponse.json({ok:result.errors.length===0,...result},{status:result.errors.length?503:200,headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({ok:false,error:'snapshots_unconfirmed'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
