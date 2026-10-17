import {NextResponse} from 'next/server';
import {authorizeSnapshotsCron,refreshSnapshots} from '@/lib/snapshots-original';
import {authorizeDataRetentionCron,deleteExpiredData} from '@/lib/data-retention-original';
export const maxDuration=60;
export async function GET(request:Request){
 // Mint both original windows before awaiting either branch;no renewed clock.
 const original=authorizeSnapshotsCron(request),retention=authorizeDataRetentionCron(request);if(!original||!retention)return NextResponse.json({error:'unauthorized'},{status:401});
 try{const result=await refreshSnapshots(original),cleanup=await deleteExpiredData(retention),ok=result.errors.length===0&&cleanup.errors.length===0;return NextResponse.json({...result,ok,cleanup:cleanup.disabled?'disabled':'bounded-original-scope',retention:cleanup},{status:ok?200:503,headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({ok:false,error:'snapshots_unconfirmed'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
