'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),bcrypt=require('bcryptjs');
const {authenticator}=require('otplib'),{load}=require('./route-harness.cjs');
const fixedEpoch=Date.UTC(2026,9,13,0,0,0),secret='JBSWY3DPEHPK3PXP';
const email='migration-native-consumption@example.invalid',password='synthetic-factor-password';
const passwordHash=bcrypt.hashSync(password,4);
function consumer(prisma,epoch=fixedEpoch,seed=secret){
 const otp=authenticator.clone({epoch,window:0});
 const api=load('lib/admin-totp-consumption.ts',{'node:crypto':crypto,otplib:{authenticator:otp},'@/lib/prisma':{prisma}},{Buffer});
 return{consume:api.consumeAdminTotp,otp,code:otp.generate(seed),seed};
}
function authFor(prisma,{epoch=fixedEpoch,id='native-consumption-admin',allowed=true,rateFailure=false,nativeRate=false,nativeAuth,nativeGetToken}={}){
 const c=consumer(prisma,epoch),user={id,email,password:passwordHash,emailVerified:new Date(fixedEpoch),createdAt:new Date(fixedEpoch),name:'Synthetic factor account'};
 const calls={limits:[]};let config;
 const rate=nativeRate?load('lib/rate-limit-db.ts',{'@/lib/prisma':{prisma}}).rateLimitDb:async(...args)=>{calls.limits.push(args);if(rateFailure)throw Error('private-limit-error');return allowed;};
 const authModule=load('auth.ts',{'next-auth/jwt':nativeGetToken??{getToken(){throw Error('No cookie read in factor fixture');}},'next-auth':options=>{config=options;return nativeAuth?nativeAuth(options):{handlers:{}};},'next-auth/providers/credentials':options=>({id:'credentials',...options}),'next-auth/providers/google':options=>({id:'google',...options}),'./auth.config':load('auth.config.ts'),'@/lib/prisma':{prisma:{user:{findUnique:async()=>user,update:async()=>{throw Error('Unexpected account write');}}}},bcryptjs:bcrypt,'next/headers':{cookies:async()=>{throw Error('No operational cookie access');}},'@/lib/admin-email':{ADMIN_EMAIL:email},'@/lib/admin-totp-consumption':{consumeAdminTotp:c.consume},'@/lib/rate-limit-db':{rateLimitDb:rate},'@/lib/totp-account':load('lib/totp-account.ts'),'@/lib/features':{AFFILIATES_DORMANT:true},'./lib/migration/local-auth-redirect.cjs':{fixtureAuthRedirect(){throw Error('No fixture HTTP redirect');}}},{Headers,crypto:crypto.webcrypto,process:{env:{ADMIN_TOTP_SECRET:secret}}});
 return{...c,config,user,calls,authModule,authorize:values=>config.providers.find(p=>p.id==='credentials').authorize({email,password,totp:c.code,...values},new Request('http://127.0.0.1:4300/api/auth/callback/credentials'))};
}
async function nativeUpdate(h,{ref='fixture-native-session-one',code=h.code}={}){
 const jwt=await import('@auth/core/jwt');
 const native=await import(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../../node_modules/@auth/core/lib/actions/session.js')).href);
 const salt='authjs.session-token',jwtSecret='synthetic-consumption-native-jwe-not-operational';
 const token={id:h.user.id,email,isAdmin:true,requiresTotp:true,requiresVerification:false,authSessionRef:ref};let emitted;
 const store={value:await jwt.encode({token,secret:jwtSecret,salt,maxAge:300}),chunk(value,options){emitted=value;return[{name:salt,value,options}];},clean(){throw Error('Unexpected native cookie clearing');}};
 const response=await native.session({jwt:{encode:jwt.encode,decode:jwt.decode,secret:jwtSecret,maxAge:300},callbacks:h.config.callbacks,events:{session:async()=>{}},logger:{error(){throw Error('Native session failure');}},cookies:{sessionToken:{name:salt}},session:{strategy:'jwt',maxAge:300}},store,[],true,{totpCode:code,expectedUserId:token.id,expectedEmail:email,expectedAuthSessionRef:ref});
 assert.ok(emitted);return{token:await jwt.decode({token:emitted,secret:jwtSecret,salt}),response};
}
function memoryStore({failure=false,lostAck=false,ack=null}={}){
 const rows=new Map(),calls=[];
 const prisma={$queryRawUnsafe:async(sql,key,counter)=>{calls.push({sql,key,counter});if(failure)throw Error('private-storage-error');if(rows.has(key)&&rows.get(key)>=counter)return[];rows.set(key,counter);if(lostAck)throw Error('private-lost-ack');return ack===null?[{key,counter}]:ack;}};
 return{prisma,rows,calls};
}
module.exports={consumer,authFor,nativeUpdate,memoryStore,fixedEpoch,secret,email,password};
