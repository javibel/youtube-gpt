'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),{fixture:authFixture}=require('./admin-native-authorization.test.cjs'),{load}=require('./route-harness.cjs'),{deferred,flush}=require('./chat-widget-harness.cjs');
async function fixture(o={}){
 const f=o.auth??await authFixture(o.authOptions??{});if(!o.auth&&!o.noLogin)await f.login(o.login);const calls=[],pending=[],entered={},gate=deferred(),timers=new Map(),clock={offset:0,elapsed:100},controller=new AbortController(),env={AUTH_URL:'http://127.0.0.1:4300',ADMIN_EMAIL:f.account()?.email,...o.env},command=crypto.randomUUID();let serial=0;
 function stage(name,fn){const p=(async()=>{calls.push(name);(entered[name]??=deferred()).resolve();if(o.held===name)await gate.promise;if(o.fail===name)throw Error('PRIVATE_'+name);const value=await fn();if(o.after)await o.after(name,f);return value;})();pending.push(p);void p.catch(()=>{});return p;}
 const globals={Buffer,ReadableStream,Headers,TextEncoder,TextDecoder,Uint8Array,AbortController,Date:new Proxy(Date,{get(t,k,r){return k==='now'?()=>Date.now()+clock.offset:Reflect.get(t,k,r);}}),performance:{now:()=>clock.elapsed},process:{env},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:clock.elapsed+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const mocks={'@/auth':{readNativeSessionCookie:req=>stage('decode',()=>o.decoder?o.decoder(req,f):f.authBindings.readNativeSessionCookie(req))},'@/lib/prisma':{prisma:{user:{findUnique:q=>stage('account',()=>o.account?o.account(q,f):f.prisma.user.findUnique(q))}}},'@/lib/admin-email':{ADMIN_EMAIL:f.account()?.email??'migration-admin@example.invalid'}};
 if(o.fetch)globals.fetch=(url,settings)=>stage('youtube',()=>o.fetch(url,settings));
 const native=load('lib/admin-social-messages.ts',mocks,globals),route=load('app/api/agent/run/route.ts',{'next/server':{NextResponse:Response},'@/lib/auth-guards':o.gate??f.guard,'@/lib/admin-social-messages':native,'@/lib/admin-social-preview-native':{},'@/lib/agent/content-generator':{}},globals);
 mocks['@/lib/admin-social-messages']=native;
 mocks['@/lib/cron-dispatch-original']=load('lib/cron-dispatch-original.ts',{'node:crypto':crypto},globals);
 const reader=load('lib/agent/youtube-comment-original.ts',mocks,globals);
 mocks['@/lib/agent/youtube-comment-original']=reader;
 const make=(x={})=>new Request(x.url??env.AUTH_URL+'/api/agent/run',{method:x.method??'POST',headers:{cookie:f.headers().get('cookie')??'',origin:env.AUTH_URL,'content-type':'application/json','x-ytv-social-messages-command':x.command??command,...x.headers},body:x.method==='GET'?undefined:x.raw??JSON.stringify(x.body??{action:'messages'}),signal:controller.signal});
 return{f,native,reader,route,calls,pending,entered,clock,controller,env,command,timers,make,release:()=>gate.resolve(),advance(ms){clock.offset+=ms;clock.elapsed+=ms;for(const[id,t]of[...timers])if(t.at<=clock.elapsed){timers.delete(id);t.fn();}},start(req=make()){const p=route.POST(req);pending.push(p);void p.catch(()=>{});return p;}};
}
async function reached(b,name){let timer;try{await Promise.race([(b.entered[name]??=deferred()).promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Missing messages stage '+name)),5000))]);}finally{clearTimeout(timer);}}
async function drain(b){b.release();let count;do{count=b.pending.length;await Promise.allSettled(b.pending);await flush();}while(count!==b.pending.length);assert.equal(b.timers.size,0);}
module.exports={fixture,reached,drain};
