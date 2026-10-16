import {randomUUID} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {runNativeAdminSocialPublish,constrainNativeAdminSocialDraft,type NativeAdminSocialPublish} from '@/lib/admin-social-publish-native';
import {generateAdminSocialDraft,publishAdminFacebookInfographic,publishAdminInstagramInfographic} from '@/lib/agent/content-generator';

type Platform='facebook'|'instagram';
type Publication=Readonly<{platform:Platform;recordId:string;postId:string}>;
type Result=Readonly<{commandRef:string;userId:string;sessionRef:string;type:'morning'|'evening';date:string;publications:readonly Publication[]}>;

// The callback is reached only inside this original's live continuation,after
// its own publishers and SQL completions. A row/date/DTO never resumes it.
export function runAdminSocialPublication<T>(original:NativeAdminSocialPublish|undefined,respond:(result:Result)=>Promise<T>):Promise<T>{
  return runNativeAdminSocialPublish(original,async(issue,own)=>{
    const date=new Date(own.at).toISOString().slice(0,10),start=new Date(date+'T00:00:00Z'),end=new Date(start.getTime()+86400000);
    const captured={META_PAGE_ID:process.env.META_PAGE_ID,META_PAGE_ACCESS_TOKEN:process.env.META_PAGE_ACCESS_TOKEN,INSTAGRAM_ACCOUNT_ID:process.env.INSTAGRAM_ACCOUNT_ID,INSTAGRAM_ACCESS_TOKEN:process.env.INSTAGRAM_ACCESS_TOKEN,INSTAGRAM_GRAPH_API_VERSION:process.env.INSTAGRAM_GRAPH_API_VERSION,META_APP_SECRET:process.env.META_APP_SECRET,BLOB_READ_WRITE_TOKEN:process.env.BLOB_READ_WRITE_TOKEN};
    const check=()=>{own.checkBeforeDispatch();if(new Date(Date.now()).toISOString().slice(0,10)!==date||Object.entries(captured).some(([k,v])=>process.env[k]!==v))throw Error('social_publish_unconfirmed');};
    const validate=async()=>{check();await own.validateBeforeDispatch();check();};
    const publications:Publication[]=[];
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
      const child=issue(platform);constrainNativeAdminSocialDraft(child,async()=>{
        await validate();const rows=await prisma.$queryRawUnsafe<{eligible:boolean}[]>(`SELECT EXISTS(SELECT 1 FROM admin_social_publish_attempts WHERE id=$1 AND "commandRef"=$2 AND platform=$3 AND "accountId"=$4 AND date=$5 AND "userId"=$6 AND "sessionRef"=$7 AND state='admitted' AND "recordId" IS NULL AND "postId" IS NULL AND "completedAt" IS NULL) AS eligible`,...args.slice(0,7));
        if(!Array.isArray(rows)||rows.length!==1||Object.keys(rows[0]).length!==1||rows[0].eligible!==true)throw Error('social_publish_unconfirmed');await validate();
      });
      const draft=await generateAdminSocialDraft(platform,own.type,child);await validate();
      const publication=await(platform==='facebook'?publishAdminFacebookInfographic(draft):publishAdminInstagramInfographic(draft));await validate();
      // Complete only the exact publisher awaited above;no lookup of a prior
      // result,claim adoption,expiry/reset or replacement command is accepted.
      const completed=await prisma.$queryRawUnsafe<{id:string}[]>(`UPDATE admin_social_publish_attempts SET state='completed',"recordId"=$8,"postId"=$9,"completedAt"=timezone('UTC',clock_timestamp())
        WHERE id=$1 AND "commandRef"=$2 AND platform=$3 AND "accountId"=$4 AND date=$5 AND "userId"=$6 AND "sessionRef"=$7 AND state='admitted' AND "recordId" IS NULL AND "postId" IS NULL AND "completedAt" IS NULL
        AND EXISTS(SELECT 1 FROM social_posts WHERE id=$8 AND platform=$3 AND status='published' AND "bufferId"=$9 AND "publishedAt" IS NOT NULL AND "imageUrl" IS NOT NULL AND "errorMsg" IS NULL) RETURNING id`,...args.slice(0,7),publication.recordId,publication.postId);
      if(!Array.isArray(completed)||completed.length!==1||Object.keys(completed[0]).length!==1||completed[0].id!==id)throw Error('social_publish_unconfirmed');await validate();publications.push(publication);
    }
    await validate();const result=await respond(Object.freeze({commandRef:own.commandRef,userId:own.actorId,sessionRef:own.sessionRef,type:own.type,date,publications:Object.freeze(publications)}));await validate();return result;
  });
}
