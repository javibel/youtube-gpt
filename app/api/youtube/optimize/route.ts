import { NextResponse } from 'next/server';
import { optimizeOriginal } from '@/lib/optimize-native-original';
export const maxDuration=60;
async function original(request:Request){try{return NextResponse.json(await optimizeOriginal(request),{headers:{'Cache-Control':'no-store'}});}catch(error){const reason=error instanceof Error?error.message:'optimize_unconfirmed';return NextResponse.json({error:['invalid_input','unauthorized','pro_required','youtube_not_connected','token_expired','source_changed'].includes(reason)?reason:'optimize_unconfirmed'},{status:reason==='invalid_input'?400:reason==='unauthorized'?401:reason==='pro_required'?403:reason==='source_changed'?409:503,headers:{'Cache-Control':'no-store'}});}}
export const GET=original,POST=original,PUT=original;
