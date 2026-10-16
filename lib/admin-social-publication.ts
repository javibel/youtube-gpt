import {randomUUID} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {authorizeNativeAdminSocialPublish,closeNativeAdminSocialPublish,runNativeAdminSocialPublish,constrainNativeAdminSocialDraft,type NativeAdminSocialPublish} from '@/lib/admin-social-publish-native';
import {generateAdminSocialDraft,publishAdminFacebookInfographic,publishAdminInstagramInfographic,validateAdminSocialPublishedDraft,type AdminSocialDraftResult} from '@/lib/agent/content-generator';

type Platform='facebook'|'instagram';
type Publication=Readonly<{platform:Platform;recordId:string;postId:string}>;
type Result=Readonly<{commandRef:string;userId:string;email:string;sessionRef:string;type:'morning'|'evening';date:string;asOf:number;expiresAt:number;publications:readonly Publication[]}>;
const requests=new WeakMap<Request,Promise<Response>>();

// The callback is reached only inside this original's live continuation,after
// its own publishers and SQL completions. A row/date/DTO never resumes it.
export function runAdminSocialPublication<T>(original:NativeAdminSocialPublish|undefined,respond:(result:Result)=>Promise<T>):Promise<T>{
  return runNativeAdminSocialPublish(original,async(issue,own)=>{
    const date=new Date(own.at).toISOString().slice(0,10),start=new Date(date+'T00:00:00Z'),end=new Date(start.getTime()+86400000);
    const captured={META_PAGE_ID:process.env.META_PAGE_ID,META_PAGE_ACCESS_TOKEN:process.env.META_PAGE_ACCESS_TOKEN,INSTAGRAM_ACCOUNT_ID:process.env.INSTAGRAM_ACCOUNT_ID,INSTAGRAM_ACCESS_TOKEN:process.env.INSTAGRAM_ACCESS_TOKEN,INSTAGRAM_GRAPH_API_VERSION:process.env.INSTAGRAM_GRAPH_API_VERSION,META_APP_SECRET:process.env.META_APP_SECRET,BLOB_READ_WRITE_TOKEN:process.env.BLOB_READ_WRITE_TOKEN};
    // Preflight both targets before any admission/model/image work. This cannot
    // prove operational permissions, but avoids predictable partial publication.
    if(![captured.META_PAGE_ID,captured.INSTAGRAM_ACCOUNT_ID].every(v=>typeof v==='string'&&/^\d{1,32}$/.test(v))
      ||![captured.META_PAGE_ACCESS_TOKEN,captured.INSTAGRAM_ACCESS_TOKEN].every(v=>typeof v==='string'&&v.length>0&&!/[\x00-\x1f\x7f]/.test(v))
      ||!captured.INSTAGRAM_GRAPH_API_VERSION||!/^v[1-9]\d{0,2}\.0$/.test(captured.INSTAGRAM_GRAPH_API_VERSION)
      ||!captured.BLOB_READ_WRITE_TOKEN||!/^vercel_blob_rw_[a-zA-Z0-9]+_[a-zA-Z0-9]+$/.test(captured.BLOB_READ_WRITE_TOKEN))throw Error('social_publish_unconfirmed');
    const check=()=>{own.checkBeforeDispatch();if(new Date(Date.now()).toISOString().slice(0,10)!==date||Object.entries(captured).some(([k,v])=>process.env[k]!==v))throw Error('social_publish_unconfirmed');};
    const validate=async()=>{check();await own.validateBeforeDispatch();check();};
    const publications:Publication[]=[],completedDrafts:AdminSocialDraftResult[]=[],claimChecks:(()=>Promise<void>)[]=[];
    for(const platform of ['facebook','instagram']as const){
      await validate();const account=platform==='facebook'?captured.META_PAGE_ID:captured.INSTAGRAM_ACCOUNT_ID;
      if(!account||!/^\d{1,32}$/.test(account))throw Error('social_publish_unconfirmed');
      const id=randomUUID(),args=[id,own.commandRef,platform,account,date,own.actorId,own.sessionRef,own.email,own.verifiedAt,start,end];
      // Unique daily target and unique command/platform arbitrate concurrent
      // originals before model/image work. Legacy/unattributed posts of ANY
      // state on this UTC day conservatively veto another platform publication.
      // Only this INSERT's own ACK proceeds;conflicts/failures remain admitted.
      const admitted=await prisma.$queryRawUnsafe<{id:string}[]>(`INSERT INTO admin_social_publish_attempts(id,"commandRef",platform,"accountId",date,"userId","sessionRef")
        SELECT $1,$2,$3,$4,$5,$6,$7 WHERE EXISTS(SELECT 1 FROM users WHERE id=$6 AND email=$8 AND "emailVerified"=timezone('UTC',$9::timestamptz))
        AND NOT EXISTS(SELECT 1 FROM social_posts WHERE platform=$3 AND "createdAt">=timezone('UTC',$10::timestamptz) AND "createdAt"<timezone('UTC',$11::timestamptz))
        ON CONFLICT DO NOTHING RETURNING id`,...args);
      if(!Array.isArray(admitted)||admitted.length!==1||Object.keys(admitted[0]).length!==1||admitted[0].id!==id)throw Error('social_publish_unconfirmed');await validate();
      let acknowledged:Publication|undefined;
      const claimCheck=async()=>{
        await validate();const rows=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM admin_social_publish_attempts WHERE id=$1 AND "commandRef"=$2 AND platform=$3 AND "accountId"=$4 AND date=$5 AND "userId"=$6 AND "sessionRef"=$7 AND ${acknowledged?`state='completed' AND "recordId"=$8 AND "postId"=$9 AND "completedAt" IS NOT NULL`:`state='admitted' AND "recordId" IS NULL AND "postId" IS NULL AND "completedAt" IS NULL`}) AS eligible`,...args.slice(0,7),...(acknowledged?[acknowledged.recordId,acknowledged.postId]:[]));
        if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).length!==1||rows[0].eligible!==true)throw Error('social_publish_unconfirmed');await validate();
      };
      const child=issue(platform);constrainNativeAdminSocialDraft(child,claimCheck);
      const draft=await generateAdminSocialDraft(platform,own.type,child);await validate();
      const publication=await(platform==='facebook'?publishAdminFacebookInfographic(draft):publishAdminInstagramInfographic(draft));await validate();
      // Complete only the exact publisher awaited above;no lookup of a prior
      // result,claim adoption,expiry/reset or replacement command is accepted.
      const completed=await prisma.$queryRawUnsafe<{id:string}[]>(`UPDATE admin_social_publish_attempts SET state='completed',"recordId"=$8,"postId"=$9,"completedAt"=timezone('UTC',clock_timestamp())
        WHERE id=$1 AND "commandRef"=$2 AND platform=$3 AND "accountId"=$4 AND date=$5 AND "userId"=$6 AND "sessionRef"=$7 AND state='admitted' AND "recordId" IS NULL AND "postId" IS NULL AND "completedAt" IS NULL
        AND EXISTS(SELECT 1 FROM social_posts WHERE id=$8 AND platform=$3 AND status='published' AND "bufferId"=$9 AND "publishedAt" IS NOT NULL AND "imageUrl" IS NOT NULL AND "errorMsg" IS NULL) RETURNING id`,...args.slice(0,7),publication.recordId,publication.postId);
      if(!Array.isArray(completed)||completed.length!==1||Object.keys(completed[0]).length!==1||completed[0].id!==id)throw Error('social_publish_unconfirmed');
      acknowledged=publication;await validate();publications.push(publication);completedDrafts.push(draft);claimChecks.push(claimCheck);
    }
    const finalCheck=async()=>{
      await validate();
      for(let i=0;i<completedDrafts.length;i++){await claimChecks[i]();await validateAdminSocialPublishedDraft(completedDrafts[i],i===completedDrafts.length-1);}
      await validate();
    };
    await finalCheck();
    const result=await respond(Object.freeze({commandRef:own.commandRef,userId:own.actorId,email:own.email,sessionRef:own.sessionRef,type:own.type,date,asOf:own.at,expiresAt:own.expiresAt,publications:Object.freeze(publications)}));
    await finalCheck();return result;
  });
}

// Native HTTP composition, reached by the manual route. No ACK builder accepts
// caller-supplied results: only this original's live responder can emit success.
export function handleAdminSocialPublication(request:Request):Promise<Response>{
  const previous=requests.get(request);if(previous)return previous;
  const promise=(async()=>{
    const original=await authorizeNativeAdminSocialPublish(request);
    if(!original)return Response.json({ok:false,error:'social_publish_unconfirmed'},{status:403,headers:{'Cache-Control':'no-store'}});
    try{return await runAdminSocialPublication(original,async socialPublication=>Response.json({ok:true,socialPublication},{headers:{'Cache-Control':'no-store'}}));}
    catch{return Response.json({ok:false,error:'social_publish_unconfirmed'},{status:503,headers:{'Cache-Control':'no-store'}});}
    finally{closeNativeAdminSocialPublish(original);}
  })();requests.set(request,promise);return promise;
}
