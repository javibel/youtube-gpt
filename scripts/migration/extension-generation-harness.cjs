'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function worker(options={}){
 const state={token:options.token===undefined?'synthetic-token':options.token,lang:'es',calls:[],timers:new Set(),storageListener:null};
 const setTimer=(fn,ms)=>{const timer={fn,ms};state.timers.add(timer);return timer;},clearTimer=timer=>state.timers.delete(timer);
 const chrome={runtime:{onMessage:{addListener:fn=>{state.listener=fn;}}},storage:{onChanged:{addListener:fn=>{state.storageListener=fn;}},local:{get:(key,fn)=>fn({ytv_token:state.token,ytv_lang:state.lang}),set:async()=>{},remove:async()=>{}}}};
 const context=vm.createContext({chrome,crypto:{randomUUID},AbortSignal:{timeout:()=>new AbortController().signal},setTimeout:setTimer,clearTimeout:clearTimer,fetch:async(url,init)=>{state.calls.push({url,init});return options.fetch?options.fetch(url,init):Response.json({content:'Synthetic answer',truncated:false});}});
 vm.runInContext(fs.readFileSync(path.join(root,'chrome-extension/background.js'),'utf8'),context);
 state.message=msg=>new Promise(resolve=>state.listener(msg,{},resolve));
 state.switchToken=token=>{state.token=token;state.storageListener({ytv_token:{newValue:token}},'local');};
 return state;
}
function client(w,options={}){
 const state={messages:[],timers:new Set(),click:null};
 const setTimer=(fn,ms)=>{const timer={fn,ms};state.timers.add(timer);return timer;},clearTimer=timer=>state.timers.delete(timer);
 const chrome={runtime:{onMessage:{addListener(){}},sendMessage:(msg,fn)=>{state.messages.push(msg);w.message(msg).then(response=>{if(options.drop&&msg.type==='GENERATE'){options.drop=false;fn({error:'generation_unconfirmed'});}else fn(response);});}}};
 const context=vm.createContext({chrome,crypto:{randomUUID},document:{addEventListener:(_name,fn)=>{state.click=fn;}},setTimeout:setTimer,clearTimeout:clearTimer});
 const source=fs.readFileSync(path.join(root,'chrome-extension/content.js'),'utf8');const end=source.indexOf('function waitForEl');if(end<0)throw Error('Missing original content boundary');
 vm.runInContext(source.slice(0,end),context);
 const ast=require('typescript').createSourceFile('content.js',source,99,true);const render=ast.statements.find(node=>node.name?.text==='renderError');if(!render)throw Error('Missing original renderError');vm.runInContext(source.slice(render.getStart(ast),render.end),context);state.errorHtml=msg=>context.renderError(msg);
 state.send=msg=>context.sendMsg(msg);state.lang=lang=>vm.runInContext('_lang='+JSON.stringify(lang),context);
 state.discard=()=>{const card={textContent:''},button={closest:()=>card};state.click({target:{closest:()=>button}});return card.textContent;};
 return state;
}
const input=(template='title',tema='Synthetic topic')=>({type:'GENERATE',template,inputs:{tema,tono:'engaging'}});
const tick=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));};
module.exports={worker,client,input,tick};
