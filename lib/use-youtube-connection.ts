'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClientReadWait } from '@/lib/client-read-wait';

type Channel = { id: string; name: string; thumbnail: string|null; subscribers: number; totalViews: number; videoCount: number };
type Video = { videoId: string; title: string; thumbnail: string; publishedAt: string; views: number };
type Growth = { subs7d: number; subs30d: number; views7d: number; views30d: number; videos7d: number; videos30d: number };
type Point = { subscribers: number; totalViews: number; recordedAt: string };
type Idea = { title_es: string; title_en: string; idea_es: string; idea_en: string };
const initial = () => ({ connected: null as boolean|null, channel: null as Channel|null, videos: [] as Video[], expired: false,
  cached: false, loading: false, error: false, connecting: false, disconnecting: false, disconnectError: false,
  growth: null as Growth|null, points: [] as Point[], ideas: null as Idea[]|null,
  statsError: false, ideasError: false, detailsLoading: false, notice: null as 'checking'|'error'|null });
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string';
const id = (v: unknown): v is string => text(v) && /^[-A-Za-z0-9_]{1,128}$/.test(v);
const date = (v: unknown): v is string => text(v) && Number.isFinite(Date.parse(v));
const image = (v: unknown): v is string => text(v) && (v === '' || /^https:\/\//.test(v));
function connection(value: unknown, userId: string) {
  const body = value as { userId?: string; connected?: boolean; expired?: boolean; cached?: boolean; channel?: Channel; videos?: Video[] } | null;
  if (!body || body.userId !== userId || typeof body.connected !== 'boolean'
    || !(body.expired === undefined || typeof body.expired === 'boolean')
    || !(body.cached === undefined || typeof body.cached === 'boolean')) throw Error('Invalid connection');
  if (!body.connected) return { connected: false, expired: !!body.expired, cached: false, channel: null, videos: [] };
  const c = body.channel;
  if (body.expired || !c || !id(c.id) || !text(c.name) || !c.name.trim() || !(c.thumbnail === null || image(c.thumbnail))
    || ![c.subscribers,c.totalViews,c.videoCount].every(count) || !Array.isArray(body.videos)) throw Error('Invalid channel');
  const videos = body.videos.map(v => {
    if (!v || !id(v.videoId) || !text(v.title) || !image(v.thumbnail) || !date(v.publishedAt) || !count(v.views)) throw Error('Invalid video');
    return { videoId:v.videoId,title:v.title,thumbnail:v.thumbnail,publishedAt:v.publishedAt,views:v.views };
  });
  return { connected:true,expired:false,cached:!!body.cached,channel:{id:c.id,name:c.name,thumbnail:c.thumbnail,
    subscribers:c.subscribers,totalViews:c.totalViews,videoCount:c.videoCount},videos };
}
function statistics(value: unknown, userId: string) {
  const body = value as { userId?: string; data?: { growth: Growth; points: Point[] } | null } | null;
  if (!body || body.userId !== userId || !Object.hasOwn(body,'data')) throw Error('Invalid statistics');
  if (body.data === null) return { growth:null,points:[] };
  const d=body.data;
  if (!d?.growth || !['subs7d','subs30d','views7d','views30d','videos7d','videos30d'].every(k=>Number.isSafeInteger(d.growth[k as keyof Growth]))
    || !Array.isArray(d.points) || !d.points.length) throw Error('Invalid growth');
  let previous = -Infinity;
  const points = d.points.map(p=>{
    if (!p || !count(p.subscribers) || !count(p.totalViews) || !date(p.recordedAt) || Date.parse(p.recordedAt) < previous) throw Error('Invalid point');
    previous=Date.parse(p.recordedAt);return { subscribers:p.subscribers,totalViews:p.totalViews,recordedAt:p.recordedAt };
  });
  return { growth:{subs7d:d.growth.subs7d,subs30d:d.growth.subs30d,views7d:d.growth.views7d,views30d:d.growth.views30d,videos7d:d.growth.videos7d,videos30d:d.growth.videos30d},points };
}
function ideas(value: unknown, userId: string): Idea[]|null {
  const body = value as { userId?: string; ideas?: Idea[]|null; date?: string } | null;
  if (!body || body.userId !== userId || !Object.hasOwn(body,'ideas')) throw Error('Invalid ideas');
  if (body.ideas === null) return null;
  if (!Array.isArray(body.ideas) || !text(body.date) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw Error('Invalid ideas');
  return body.ideas.map(i=>{
    if (!i || !['title_es','title_en','idea_es','idea_en'].every(k=>text(i[k as keyof Idea]))) throw Error('Invalid idea');
    return {title_es:i.title_es,title_en:i.title_en,idea_es:i.idea_es,idea_en:i.idea_en};
  });
}

export function useYoutubeConnection(userId: string|undefined, email: string|null|undefined, authStatus: string) {
  const scope = useMemo(()=>({active:true,sequence:0,connected:null as boolean|null,channelId:null as string|null,
    read:null as Promise<void>|null,details:null as Promise<void>|null,disconnect:null as Promise<void>|null,
    readWait:null as ReturnType<typeof createClientReadWait>|null,detailWaits:new Set<ReturnType<typeof createClientReadWait>>(),
    disconnectWait:null as ReturnType<typeof createClientReadWait>|null,
    statsFailed:false,ideasFailed:false,timer:null as ReturnType<typeof setTimeout>|null}),[userId,email,authStatus]);
  const active=useRef(scope);active.current=scope;
  const [store,setStore]=useState(()=>({scope,...initial()}));
  const current=useCallback(()=>active.current===scope && scope.active && authStatus==='authenticated' && !!userId,[scope,authStatus,userId]);
  const update=useCallback((fn:(v:ReturnType<typeof initial>)=>ReturnType<typeof initial>)=>{
    if(current())setStore(prev=>({scope,...fn(prev.scope===scope?prev:initial())}));
  },[scope,current]);
  const cancelReads=useCallback(()=>{
    scope.readWait?.cancel();
    for(const waiting of scope.detailWaits)waiting.cancel();
  },[scope]);
  const details=useCallback(async(sequence:number,stats=true,daily=true)=>{
    if(!current() || scope.sequence!==sequence || !scope.connected || scope.disconnect)return;
    update(v=>({...v,detailsLoading:true}));
    const valid=()=>current() && scope.sequence===sequence && scope.connected && !scope.disconnect;
    const readDetail=async(kind:'stats'|'ideas')=>{
      const waiting=createClientReadWait();scope.detailWaits.add(waiting);
      try{
        const r=await waiting.wait(fetch(kind==='stats'?'/api/youtube/stats':'/api/daily-ideas',{cache:'no-store',signal:waiting.signal}));
        if(!r.ok)throw Error();const body=await waiting.wait(r.json());
        if(kind==='stats'){
          const data=statistics(body,userId!);if(valid()){scope.statsFailed=false;update(v=>({...v,...data,statsError:false}));}
        }else{
          const data=ideas(body,userId!);if(valid()){scope.ideasFailed=false;update(v=>({...v,ideas:data,ideasError:false}));}
        }
      }catch{
        if(valid()){
          if(kind==='stats'){scope.statsFailed=true;update(v=>({...v,statsError:true}));}
          else{scope.ideasFailed=true;update(v=>({...v,ideasError:true}));}
        }
      }finally{waiting.finish();scope.detailWaits.delete(waiting);}
    };
    await Promise.all([stats?readDetail('stats'):Promise.resolve(),daily?readDetail('ideas'):Promise.resolve()]);
    if(valid())update(v=>({...v,detailsLoading:false}));
  },[scope,current,update,userId]);
  const retryYoutube=useCallback(async()=>{
    if(!current() || scope.disconnect)return;
    if(scope.read)return scope.read;
    const sequence=++scope.sequence;
    const waiting=createClientReadWait();scope.readWait=waiting;
    update(v=>({...v,loading:true,error:false,detailsLoading:false}));
    const flight=(async()=>{try{
      const r=await waiting.wait(fetch('/api/youtube/channel',{cache:'no-store',signal:waiting.signal}));if(!r.ok)throw Error();const data=connection(await waiting.wait(r.json()),userId!);
      waiting.finish();if(scope.readWait===waiting)scope.readWait=null;
      if(!current() || scope.sequence!==sequence)return;
      const changed=scope.channelId!==data.channel?.id;scope.connected=data.connected;scope.channelId=data.channel?.id??null;
      update(v=>({...v,...data,...(!data.connected||changed?{growth:null,points:[],ideas:null,statsError:false,ideasError:false}:{}),loading:false}));
      if(data.connected)await details(sequence);else{scope.statsFailed=false;scope.ideasFailed=false;}
    }catch{if(current()&&scope.sequence===sequence)update(v=>({...v,error:true}));}
    finally{waiting.finish();if(scope.readWait===waiting)scope.readWait=null;if(current()&&scope.sequence===sequence)update(v=>({...v,loading:false}));}})();
    scope.read=flight;try{await flight;}finally{if(scope.read===flight)scope.read=null;}
  },[scope,current,update,userId,details]);
  const retryYoutubeDetails=useCallback(async()=>{
    if(!current()||scope.disconnect)return;if(scope.read)return scope.read;if(scope.details)return scope.details;
    const flight=details(scope.sequence,scope.statsFailed,scope.ideasFailed);scope.details=flight;
    try{await flight;}finally{if(scope.details===flight)scope.details=null;}
  },[scope,current,details]);
  const handleYtDisconnect=useCallback(async()=>{
    if(!current())return;if(scope.disconnect)return scope.disconnect;if(scope.connected!==true)return;
    ++scope.sequence;cancelReads();update(v=>({...v,disconnecting:true,disconnectError:false,loading:false,detailsLoading:false}));
    const waiting=createClientReadWait();scope.disconnectWait=waiting;
    const flight=(async()=>{try{
      const r=await waiting.wait(fetch('/api/youtube/disconnect',{method:'POST',signal:waiting.signal}));if(!r.ok)throw Error();const body=await waiting.wait(r.json());
      if(body?.ok!==true||body.userId!==userId)throw Error();if(!current())return;
      scope.connected=false;scope.channelId=null;scope.statsFailed=false;scope.ideasFailed=false;
      update(v=>({...initial(),connected:false,notice:v.notice}));
    }catch{if(current())update(v=>({...v,disconnectError:true}));}
    finally{waiting.finish();if(scope.disconnectWait===waiting)scope.disconnectWait=null;update(v=>({...v,disconnecting:false}));}})();
    scope.disconnect=flight;try{await flight;}finally{if(scope.disconnect===flight)scope.disconnect=null;}
  },[scope,current,update,userId,cancelReads]);
  const handleYtConnect=useCallback(()=>{if(!current()||scope.disconnect||scope.connected!==false)return;update(v=>({...v,connecting:true}));window.location.href='/api/youtube/auth';},[scope,current,update]);
  useEffect(()=>{
    scope.active=true;active.current=scope;setStore({scope,...initial()});void retryYoutube();
    if(current()){
      const notice=new URLSearchParams(window.location.search).get('yt');
      if(notice==='connected'||notice==='error'){
        update(v=>({...v,notice:notice==='connected'?'checking':'error'}));window.history.replaceState({},'','/dashboard');
        scope.timer=setTimeout(()=>update(v=>({...v,notice:null})),4000);
      }
    }
    return()=>{
      scope.active=false;if(scope.timer)clearTimeout(scope.timer);
      // Immediate Strict Mode setup keeps the same original read alive.
      void Promise.resolve().then(()=>{if(!scope.active||active.current!==scope){cancelReads();scope.disconnectWait?.cancel();}});
    };
  },[scope,current,update,retryYoutube,cancelReads]);
  const view=store.scope===scope&&current()?store:initial();
  return {ytChannel:view.channel,ytVideos:view.videos,ytConnected:view.connected,ytExpired:view.expired,
    ytConnecting:view.connecting,ytDisconnecting:view.disconnecting,ytGrowth:view.growth,ytSparkline:view.points,dailyIdeas:view.ideas,
    ytLoading:view.loading,ytError:view.error||(authStatus==='authenticated'&&!userId),ytCached:view.cached,
    ytDisconnectError:view.disconnectError,ytStatsError:view.statsError,ytIdeasError:view.ideasError,ytDetailsLoading:view.detailsLoading,
    ytNotice:view.notice,retryYoutube,retryYoutubeDetails,handleYtConnect,handleYtDisconnect};
}
