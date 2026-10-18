
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {deferred,flush}=require('./chat-widget-harness.cjs');
const reply=(data,status=200)=>Response.json(data,{status});
const root=path.resolve(__dirname,'../..'),parentRoot=path.resolve(root,'../../outputs/inventario-v1.1/native-session-read-candidate-2026-10-13/parent');
const session=()=>({user:{id:'fixture-one',email:'fixture-one@example.invalid',name:'Fixture',isAdmin:true,requiresTotp:false,requiresVerification:false,authSessionRef:'fixture-session-one'},expires:'2026-11-12T00:00:00.000Z'});
function fixture({mode='provider',parent=false,sourceOverrides={},siteKey,widgetApi}={}){
 const contexts=new Map(),cache=new Map(),requests=[],timers=new Map(),events=new Map(),channels=[],storage=new Map(),navigation=[],control={};let current,index=0,serial=0,now=0,dirty=false,live=new Set(),effects=[];
 const state={query:{email:'fixture-one@example.invalid'},sessionValue:{data:session(),status:'authenticated',update:async()=>session()},sdkCalls:0,updates:0};
 const hooks={
  useState(initial){const c=current,i=index++;if(!c.cells[i])c.cells[i]={value:typeof initial==='function'?initial():initial};return[c.cells[i].value,next=>{c.cells[i].value=typeof next==='function'?next(c.cells[i].value):next;dirty=true;}];},
  useRef(value){return current.cells[index++]??={current:value};},
  useMemo(fn,deps){const c=current,i=index++,old=c.cells[i];if(!old||old.deps.length!==deps.length||deps.some((x,n)=>!Object.is(x,old.deps[n])))c.cells[i]={value:fn(),deps};return c.cells[i].value;},
  useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
  useEffect(fn,deps=[]){const c=current,i=index++,old=c.cells[i];if(!old||old.deps.length!==deps.length||deps.some((x,n)=>!Object.is(x,old.deps[n]))){c.cells[i]={fn,deps};effects.push(()=>{old?.cleanup?.();c.cells[i].cleanup=fn();});}},
  createContext(){return{Provider:'session-context'};},useContext(){return state.sessionValue;},
  Suspense:'suspense',Fragment:'fragment'
 };
 const scripts=[],dom=new Map();
 const document={referrer:'',head:{appendChild:node=>scripts.push(node),removeChild:node=>{const at=scripts.indexOf(node);if(at>=0)scripts.splice(at,1);}},createElement:tag=>({tagName:tag}),visibilityState:'visible',cookie:'',addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener(name,fn){events.get(name)?.delete(fn);}};
 class Channel{constructor(name){this.name=name;this.listeners=new Set();this.closed=false;channels.push(this);}addEventListener(name,fn){assert.equal(name,'message');this.listeners.add(fn);}removeEventListener(name,fn){this.listeners.delete(fn);}postMessage(value){state.broadcasts=(state.broadcasts??0)+1;}close(){this.closed=true;}}
 const globals={console:{log(){},error(){},warn(){},debug(){}},process:{env:siteKey?{NEXT_PUBLIC_TURNSTILE_SITE_KEY:siteKey}:{}},Request,Response,Headers,ReadableStream,Uint8Array,TextEncoder,TextDecoder,URL,URLSearchParams,document,BroadcastChannel:Channel,window:{turnstile:widgetApi,addEventListener(){},removeEventListener(){},location:{origin:'http://127.0.0.1:4300',pathname:mode==='signup'?'/signup':mode==='login'?'/login':'/verify-email',search:'',get href(){return 'http://127.0.0.1:4300/login';},set href(value){navigation.push(value);},reload(){navigation.push('reload');}}},navigator:{onLine:true},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Date:class extends Date{static now(){return 1791852000000+now;}},performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),setInterval(){throw Error('No polling interval authorized');},clearInterval(){},fetch:async(url,init={})=>{
  const p=new URL(url,'http://127.0.0.1:4300').pathname,request={url:p,init};requests.push(request);
  assert.ok(['/api/auth/session','/api/auth/csrf','/api/auth/verify-totp','/api/auth/signout','/api/auth/providers','/api/auth/callback/credentials','/api/auth/verify-email','/api/auth/resend-verification','/api/auth/signin/google','/api/signup'].includes(p),'Unexpected fixture route '+p);
  if(control.fetch)return control.fetch(request);
  if(p==='/api/auth/session')return control.session?control.session(request):reply(session());
  if(p==='/api/auth/providers')return control.providers?control.providers(request):reply({credentials:{id:'credentials',type:'credentials'},google:{id:'google',type:'oidc'}});
  if(p==='/api/auth/signin/google')return control.google?control.google(request):reply({url:control.googleUrl??'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=synthetic-google&redirect_uri=http%3A%2F%2F127.0.0.1%3A4300%2Fapi%2Fauth%2Fcallback%2Fgoogle&scope=openid+profile+email&code_challenge='+ 'a'.repeat(43)+'&code_challenge_method=S256'});
  if(p==='/api/signup')return control.signup?control.signup(request):reply({ok:true});
  if(p==='/api/auth/csrf')return reply({csrfToken:'a'.repeat(64)});
  if(p==='/api/auth/callback/credentials'){state.sdkCalls++;return control.signin?control.signin(request):reply({url:'http://127.0.0.1:4300/dashboard'});}
  if(p==='/api/auth/verify-totp')return reply({verified:true});
  if(p==='/api/auth/signout')return control.signout?control.signout(request):reply({url:'http://127.0.0.1:4300/'});
  if(p==='/api/auth/verify-email')return reply({verified:true});
  if(p==='/api/auth/resend-verification')return reply({ok:true}); // Synthetic receipt only, no mail transport.
 }};
 function load(name){if(cache.has(name))return cache.get(name);let file;
  if(name==='sdk')file=path.join(root,'node_modules/next-auth/react.js');
  else if(name==='auth-errors')file=path.join(root,'node_modules/@auth/core/errors.js');
  else if(name==='sdk-client')file=path.join(root,'node_modules/next-auth/lib/client.js');
  else file=sourceOverrides[name]??(parent&&['components/SessionProviderWrapper.tsx','app/login/LoginForm.tsx','app/verify-email/page.tsx'].includes(name)?path.join(parentRoot,name):path.join(root,name));
  const entry={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:entry,exports:entry.exports,require:id=>{
   if(id==='react')return hooks;if(id==='react/jsx-runtime')return{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key}),Fragment:'fragment'};
   if(id==='next-auth/react'){const sdk=load('sdk');if(mode!=='provider')return{...sdk,useSession:()=>state.sessionValue};return sdk;}
   if(id==='./lib/client.js')return load('sdk-client');
   if(id==='@auth/core/errors')return load('auth-errors');
   if(id==='next/navigation')return{useRouter:()=>({push:value=>navigation.push('soft:'+value)}),usePathname:()=>globals.window.location.pathname,useSearchParams:()=>({get:k=>state.query[k]??null,toString:()=>new URLSearchParams(state.query).toString()})};
   if(id==='@/components/CookieConsent')return load('components/CookieConsent.tsx');
   if(id==='@/components/LangProvider')return {useLang:()=> 'es'};
   if(id==='@/components/icons')return load('components/icons/index.tsx');
   if(id==='@/components/PasswordInput')return load('components/PasswordInput.tsx');
   if(id.startsWith('@/lib/'))return load(id.slice(2)+'.ts');
   throw Error('Unexpected test dependency '+id);
  },...globals},{filename:name});cache.set(name,entry.exports);return entry.exports;
 }
 function render(node,id){if(Array.isArray(node))return node.map((n,i)=>render(n,id+'/'+i));if(!node||typeof node!=='object')return node;if(node.type==='session-context'){state.sessionValue=node.props.value;return{...node,props:{...node.props,children:render(node.props.children,id+'/context')}};}if(typeof node.type==='function'){const key=id+'/'+node.type.name+'/'+(node.key??''),c=contexts.get(key)??{cells:[]};contexts.set(key,c);live.add(key);const prior=current,priorIndex=index;current=c;index=0;const result=node.type(node.props);current=prior;index=priorIndex;return render(result,key);}if(node.props?.ref && typeof node.props.ref==='object'){let element=dom.get(id);if(!element){element={isConnected:true};dom.set(id,element);}node.props.ref.current=element;}return{...node,props:{...node.props,children:render(node.props?.children,id+'/children')}};}
 const component=load(mode==='provider'?'components/SessionProviderWrapper.tsx':mode==='login'?'app/login/LoginForm.tsx':mode==='signup'?'app/signup/SignupForm.tsx':'app/verify-email/page.tsx').default;
 function view(){for(let n=0;n<25;n++){dirty=false;live=new Set();const tree=render({type:component,props:{children:state.childPath?{type:load(state.childPath).default,props:{}}:null}},'root');for(const[k,c]of contexts)if(!live.has(k)){for(const cell of c.cells)cell?.cleanup?.();contexts.delete(k);}while(effects.length)effects.shift()();if(!dirty)return tree;}throw Error('Native session fixture did not settle');}
 function nodes(tree){if(arguments.length===0)tree=view();if(Array.isArray(tree))return tree.flatMap(n=>nodes(n));if(!tree||typeof tree!=='object')return typeof tree==='string'?[tree]:[];return[tree,...nodes(tree.props?.children??null)];}
 const text=()=>nodes().filter(n=>typeof n==='string').join(' ');
 const unmount=()=>{for(const c of contexts.values())for(const cell of c.cells)cell?.cleanup?.();contexts.clear();for(const element of dom.values())element.isConnected=false;dom.clear();};
 return{state,control,load,requests,events,channels,storage,navigation,timers,browser:globals,scripts,dom,view,nodes,text,unmount,advance(ms){now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}},visibility(){for(const fn of events.get('visibilitychange')??[])fn();},broadcast(data={event:'session'}){for(const channel of channels.filter(x=>!x.closed))for(const fn of channel.listeners)fn({data});},strictEffects(){for(const c of contexts.values())for(const cell of c.cells)if(cell.fn){cell.cleanup?.();cell.cleanup=cell.fn();}},ready:async()=>{for(let i=0;i<6;i++){view();await flush();}},submit(){const form=nodes().find(n=>n.type==='form');assert.ok(form);return form.props.onSubmit({preventDefault(){}});},change(type,value){const field=nodes().find(n=>n.type===type||n.type==='input'&&n.props.type===type);assert.ok(field);field.props.onChange({target:{value}});view();},observe(){const button=nodes().find(n=>n.type==='button');assert.ok(button);button.props.onClick();}};
}
module.exports={fixture,session,deferred,flush,reply};
