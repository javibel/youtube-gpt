import { randomUUID } from 'node:crypto';
import { getMessagesTask } from '@/lib/ai/task-runtime';
import { prisma } from '@/lib/prisma';
import { isInternalAccount } from '@/lib/internal-accounts';
import { runCronDailyIdeas, type NativeCronDailyIdeas } from '@/lib/cron-dispatch-original';

const select = { id:true,userId:true,channelId:true,channelName:true,subscribers:true,videoCount:true,user:{select:{email:true}} } as const;
function read(userId:string) { return prisma.youtubeToken.findUnique({where:{userId},select}); }
type Source = NonNullable<Awaited<ReturnType<typeof read>>>;
function eligible(user:Source) {
  const email=(user.user?.email??'').trim().toLowerCase();
  return !!user.id && !!user.userId && !!user.channelId && !!email
    && (email==='ytbeviral@gmail.com' || !isInternalAccount(email));
}
function same(a:Source,b:Source|null) {
  return !!b && eligible(b) && a.id===b.id && a.userId===b.userId && a.channelId===b.channelId
    && a.channelName===b.channelName && a.subscribers===b.subscribers && a.videoCount===b.videoCount && a.user.email===b.user.email;
}
const currentSource = `EXISTS(SELECT 1 FROM youtube_tokens y JOIN users u ON u.id=y."userId"
  WHERE y."userId"=$2 AND u.email=$4 AND y.id=$5 AND y."channelId"=$6
    AND y."channelName" IS NOT DISTINCT FROM $7 AND y.subscribers IS NOT DISTINCT FROM $8 AND y."videoCount" IS NOT DISTINCT FROM $9)`;

async function produce(user:Source,date:string,check:()=>void):Promise<void> {
  check(); if(!same(user,await read(user.userId)))throw Error('daily_ideas_unconfirmed'); check();
  const recentGens=await prisma.generation.findMany({where:{userId:user.userId,template:{in:['title','description']}},orderBy:{createdAt:'desc'},take:10,select:{output:true}});
  check();
  const recentTitles=recentGens.map(g=>g.output.slice(0,80)).join('\n');
  const subs=user.subscribers?parseInt(user.subscribers,10):0,vids=user.videoCount?parseInt(user.videoCount,10):0;
  if(!Number.isFinite(subs)||!Number.isFinite(vids))throw Error('daily_ideas_unconfirmed');
  const attemptId=randomUUID(),ideaId=randomUUID(),args=[attemptId,user.userId,date,user.user.email,user.id,user.channelId,user.channelName,user.subscribers,user.videoCount];
  check();
  const admitted=await prisma.$queryRawUnsafe<{id:string;userId:string;date:string;state:string}[]>(`
    INSERT INTO daily_idea_generation_attempts(id,"userId",date)
    SELECT $1,$2,$3 WHERE ${currentSource} AND NOT EXISTS(SELECT 1 FROM daily_ideas WHERE "userId"=$2 AND date=$3)
    ON CONFLICT("userId",date) DO NOTHING RETURNING id,"userId",date,state`,...args);
  if(!Array.isArray(admitted)||admitted.length!==1||Object.keys(admitted[0]).length!==4||admitted[0].id!==attemptId||admitted[0].userId!==user.userId||admitted[0].date!==date||admitted[0].state!=='pending')throw Error('daily_ideas_unconfirmed');
  // Only this INSERT's own ACK admits this producer. Old/lost markers veto.
  check();if(!same(user,await read(user.userId)))throw Error('daily_ideas_unconfirmed');check();
  const task=await getMessagesTask({operationKey:attemptId,userId:user.userId,taskType:'creator.daily-ideas',language:'es',instructionsVersion:'daily-ideas-v1',outputSchema:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,required:['title_es','title_en','idea_es','idea_en'],properties:{title_es:{type:'string',minLength:1},title_en:{type:'string',minLength:1},idea_es:{type:'string',minLength:1},idea_en:{type:'string',minLength:1}}}}});
  check();if(!same(user,await read(user.userId)))throw Error('daily_ideas_unconfirmed');check();
  // Retain the same invoked model and its own SQL completion after retirement.
  const result=await task.create({max_tokens:2000,messages:[{role:'user',content: `You are a YouTube growth advisor. Generate 5 personalized video ideas for this creator.

Today is ${date} — the current year is ${date.slice(0,4)}.
NEVER put a past year in a title. If a title needs a year, it must be ${date.slice(0,4)}.

Channel: ${user.channelName || 'Unknown'}
Subscribers: ${subs}
Total videos: ${vids}
Recent content: ${recentTitles || 'No recent titles available'}

Rules:
- Each idea must be specific and actionable, not generic
- Ideas should match the channel's apparent niche and size
- For small channels (<1K subs): focus on searchable, niche topics
- For medium channels (1K-50K): mix of search and trending topics
- For large channels (50K+): trending, collab ideas, series concepts
- Each idea: 1 sentence max explaining the angle

Suggested titles are graded by our free Title Analyzer (app/title-analyzer,
scored 0-100), which is the tool that judges a bare title — the SEO score grades
published videos and cannot fully judge a title on its own. Aim for 85+:
- 40-70 characters (25 pts)
- Contains a digit, e.g. "7 mistakes", "23 facts" — not spelled out (15 pts)
- At least TWO power words for full marks: how, why, best, easy, fast, free, new,
  secret, proven, ultimate, simple, stop, never, avoid, mistake, truth, guide,
  tips, real, honest, worst, top, vs, before, after (20 pts)
- Wrap a qualifier in brackets or parentheses, e.g. "(Explained)" (10 pts)
- 4-9 words total (10 pts)
- No ALL-CAPS words (10 pts)
- A search-intent hook: start with how/why/what, or end with "?" (10 pts)

Respond ONLY with JSON array, no other text:
[{"title_es":"título sugerido","title_en":"suggested title","idea_es":"explicación breve","idea_en":"brief explanation"}]`}]});
  if(!Array.isArray(result.content)||result.content.length!==1||result.content[0]?.type!=='text'||typeof result.content[0].text!=='string')throw Error('daily_ideas_unconfirmed');
  const ideas=JSON.parse(result.content[0].text) as unknown;
  if(!Array.isArray(ideas)||ideas.length<1||ideas.length>5||!ideas.every((v:unknown)=>{
    if(!v||typeof v!=='object'||Array.isArray(v))return false;
    const row=v as Record<string,unknown>;
    return Object.keys(row).sort().join(',')==='idea_en,idea_es,title_en,title_es' && Object.values(row).every(x=>typeof x==='string'&&x.trim().length>0&&x.length<=2000);
  }))throw Error('daily_ideas_unconfirmed');
  const saved=await prisma.$queryRawUnsafe<{ideaId:string;attemptId:string}[]>(`
    WITH own AS MATERIALIZED(SELECT id FROM daily_idea_generation_attempts WHERE id=$1 AND "userId"=$2 AND date=$3 AND state='pending' FOR UPDATE),
    saved AS(INSERT INTO daily_ideas(id,"userId",date,ideas,"createdAt") SELECT $10,$2,$3,$11::jsonb,timezone('UTC',clock_timestamp()) FROM own WHERE ${currentSource}
      ON CONFLICT("userId",date) DO NOTHING RETURNING id),
    completed AS(UPDATE daily_idea_generation_attempts SET state='completed',"completedAt"=timezone('UTC',clock_timestamp()) WHERE id=$1 AND "userId"=$2 AND date=$3 AND state='pending' AND EXISTS(SELECT 1 FROM saved) RETURNING id)
    SELECT s.id AS "ideaId",c.id AS "attemptId" FROM saved s CROSS JOIN completed c`,...args,ideaId,JSON.stringify(ideas));
  if(!Array.isArray(saved)||saved.length!==1||Object.keys(saved[0]).length!==2||saved[0].ideaId!==ideaId||saved[0].attemptId!==attemptId)throw Error('daily_ideas_unconfirmed');
}

export type DailyIdeasScan={generated:number;scanned:number;pages:number;unconfirmed:number;hasMore:boolean;coverage:'pages-within-original-budget'};
export function generateDailyIdeas(original?:NativeCronDailyIdeas):Promise<DailyIdeasScan> {
  return runCronDailyIdeas(original,async({date,checkBeforeDispatch:check})=>{
    const result:DailyIdeasScan={generated:0,scanned:0,pages:0,unconfirmed:0,hasMore:false,coverage:'pages-within-original-budget'};
    let cursor:string|undefined;const seen=new Set<string>();
    // At most32 bounded queries of25 candidates. Cursor stays lexical/private;
    // hasMore preserves coverage uncertainty. No serialized resume or new budget.
    for(let page=0;page<32;page++){
      check();const users=await prisma.youtubeToken.findMany({where:{...(cursor?{userId:{gt:cursor}}:{}),channelId:{not:null},user:{dailyIdeas:{none:{date}}}},orderBy:{userId:'asc'},take:25,select});check();
      if(!Array.isArray(users)||users.length>25)throw Error('daily_ideas_unconfirmed');
      result.pages++;result.hasMore=users.length===25;
      for(const user of users){check();if(!user.userId||seen.has(user.userId))throw Error('daily_ideas_unconfirmed');seen.add(user.userId);cursor=user.userId;result.scanned++;
        if(!eligible(user))continue;
        try{await produce(user,date,check);result.generated++;}catch{result.unconfirmed++;check();}
        check();
      }
      if(!result.hasMore)return result;
    }
    return result;
  });
}
