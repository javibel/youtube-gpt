import { createAbTestOriginal } from '@/lib/ab-create-original';
import { readAbHistoryOriginal } from '@/lib/ab-history-original';
import { mutateAbTestOriginal } from '@/lib/ab-mutate-original';
export const maxDuration=60;
export const GET=readAbHistoryOriginal;
export const POST=createAbTestOriginal;
export const PATCH=mutateAbTestOriginal;
