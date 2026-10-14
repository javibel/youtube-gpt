const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function projectExtensionDailyIdeas(channel:unknown,batch:unknown,ownerId:string,day:string,now:number) {
  if (channel!==null&&(!object(channel)||channel.userId!==ownerId||!(channel.channelId===null||typeof channel.channelId==='string'&&/^UC[A-Za-z0-9_-]{22}$/.test(channel.channelId)))) throw Error('Daily ideas unconfirmed');
  const connected=!!(channel&&object(channel)&&channel.channelId);
  const empty={ideas:null,date:null,channelConnected:connected,batchState:connected?'pending':'not-connected',
    requestedDate:day,dataQuality:{source:'stored-daily-ideas',freshness:'unconfirmed',savedAt:null,connection:'stored-channel-reference'}};
  if(!connected||batch===null)return empty;
  if(!object(batch)||batch.userId!==ownerId||batch.date!==day||!(batch.createdAt instanceof Date)
    ||!Number.isFinite(batch.createdAt.getTime())||batch.createdAt.getTime()<0||batch.createdAt.getTime()>now||batch.createdAt.toISOString().slice(0,10)!==day
    ||!Array.isArray(batch.ideas)||batch.ideas.length<1||batch.ideas.length>5)throw Error('Daily ideas unconfirmed');
  const ideas=batch.ideas.map(value=>{
    if(!object(value))throw Error('Daily ideas unconfirmed');
    const fields=['title_es','title_en','idea_es','idea_en'] as const;
    for(const key of fields)if(typeof value[key]!=='string'||!(value[key] as string).trim()||(value[key] as string).length>(key.startsWith('title')?200:4000))throw Error('Daily ideas unconfirmed');
    return {title_es:value.title_es as string,title_en:value.title_en as string,idea_es:value.idea_es as string,idea_en:value.idea_en as string};
  });
  if(new TextEncoder().encode(JSON.stringify(ideas)).byteLength>48*1024)throw Error('Daily ideas unconfirmed');
  return {ideas,date:batch.date,channelConnected:true,batchState:'available',requestedDate:day,
    dataQuality:{source:'stored-daily-ideas',freshness:'unconfirmed',savedAt:batch.createdAt.toISOString(),connection:'stored-channel-reference'}};
}
