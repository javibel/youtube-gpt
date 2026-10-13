'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const {deferred,flush}=require('./chat-widget-harness.cjs');
const root=path.resolve(__dirname,'../..');
function fixture({mode='inline',sourceOverrides={}}={}){
 const contexts=new Map(),cache=new Map(),requests=[],timers=new Map(),events=new Map(),storage=new Map(),navigation=[],control={};
 let current,index=0,serial=0,now=0,dirty=false,live=new Set(),effects=[];
 const state={lang:'es',source:'homepage-cta',query:{}};
 const hooks={
  useState(initial){const c=current,i=index++;if(!c.cells[i])c.cells[i]={value:typeof initial==='function'?initial():initial};return[c.cells[i].value,next=>{const value=typeof next==='function'?next(c.cells[i].value):next;if(!Object.is(value,c.cells[i].value)){c.cells[i].value=value;dirty=true;}}];},
  useRef(value){return current.cells[index++]??={current:value};},
  useMemo(fn,deps){const c=current,i=index++,old=c.cells[i];if(!old||old.deps.length!==deps.length||deps.some((x,n)=>!Object.is(x,old.deps[n])))c.cells[i]={value:fn(),deps};return c.cells[i].value;},
  useCallback(fn,deps){return hooks.useMemo(()=>fn,deps);},
  useEffect(fn,deps=[]){const c=current,i=index++,old=c.cells[i];if(!old||old.deps.length!==deps.length||deps.some((x,n)=>!Object.is(x,old.deps[n]))){c.cells[i]={fn,deps};effects.push(()=>{old?.cleanup?.();c.cells[i].cleanup=fn();});}},
  Suspense:'suspense',Fragment:'fragment'
 };
 const document={referrer:'',cookie:'',addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);},removeEventListener(name,fn){events.get(name)?.delete(fn);}};
 const globals={console:{log(){},error(){},warn(){}},process:{env:{}},Request,Response,TextEncoder,TextDecoder,URL,URLSearchParams,document,
  window:{location:{origin:'http://127.0.0.1:4300',pathname:mode==='launch'?'/launch':'/title-analyzer',search:'',get href(){return this.origin+this.pathname+this.search;},set href(value){navigation.push(value);}}},
  sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  performance:{now:()=>now},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id),
  setInterval(){throw Error('No polling authorized');},clearInterval(){},
  fetch:async(url,init={})=>{assert.equal(url,'/api/affiliates/apply');const request={url,init};requests.push(request);if(control.fetch)return control.fetch(request);return init.method==='POST'?ack():Response.json({count:17});}
 };
 function load(name){
  if(cache.has(name))return cache.get(name);const entry={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(sourceOverrides[name]??path.join(root,name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{
   module:entry,exports:entry.exports,require:id=>{
    if(id==='react')return hooks;
    if(id==='react/jsx-runtime')return{jsx:(type,props,key)=>({type,props,key}),jsxs:(type,props,key)=>({type,props,key}),Fragment:'fragment'};
    if(id==='next/navigation')return{usePathname:()=>globals.window.location.pathname,useSearchParams:()=>({get:k=>state.query[k]??null,toString:()=>new URLSearchParams(state.query).toString()})};
    if(id==='@/components/LangProvider')return{useLang:()=>state.lang};
    if(id==='@/components/CurrencyProvider')return{useCurrency:()=> 'EUR'};
    if(id==='@/components/PublicNav')return{default:()=>null};
    if(id==='@/lib/pricing')return{PRICES:{pro:{monthly:{eur:1000}}},formatPrice:()=> 'Synthetic price'};
    if(id==='@/components/icons')return{RocketIcon:()=>'icon',CheckIcon:()=>'check'};
    if(id.startsWith('@/'))return load(id.slice(2)+(id.startsWith('@/lib/')?'.ts':'.tsx'));
    throw Error('Unexpected fixture dependency '+id);
   },...globals},{filename:name});cache.set(name,entry.exports);return entry.exports;
 }
 function render(node,id){if(Array.isArray(node))return node.map((n,i)=>render(n,id+'/'+i));if(!node||typeof node!=='object')return node;
  if(typeof node.type==='function'){const key=id+'/'+node.type.name+'/'+(node.key??''),c=contexts.get(key)??{cells:[]};contexts.set(key,c);live.add(key);const prior=current,priorIndex=index;current=c;index=0;const result=node.type(node.props);current=prior;index=priorIndex;return render(result,key);}
  return{...node,props:{...node.props,children:render(node.props?.children,id+'/children')}};
 }
 const names={inline:'app/affiliates/AffiliatesClient.tsx',popup:'components/ExitIntentPopup.tsx',launch:'app/launch/LaunchClient.tsx'};
 function view(){for(let n=0;n<25;n++){dirty=false;live=new Set();const selected=mode==='all'?['inline','popup','launch']:[mode];
  const tree=render(selected.map(m=>({type:load(names[m]).default,props:{lang:state.lang,source:state.source}})),'root');
  for(const[k,c]of contexts)if(!live.has(k)){for(const cell of c.cells)cell?.cleanup?.();contexts.delete(k);}
  while(effects.length)effects.shift()();if(!dirty)return tree;}throw Error('Waitlist fixture did not settle');
 }
 function nodes(tree){if(arguments.length===0)tree=view();if(Array.isArray(tree))return tree.flatMap(n=>nodes(n));if(!tree||typeof tree!=='object')return typeof tree==='string'||typeof tree==='number'?[String(tree)]:[];return[tree,...nodes(tree.props?.children??null)];}
 const unmount=()=>{for(const c of contexts.values())for(const cell of c.cells)cell?.cleanup?.();contexts.clear();};
 const advance=(ms,fire=true)=>{now+=ms;if(fire)for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 const ready=async()=>{for(let i=0;i<6;i++){view();await flush();}};
 const change=(value,at=0)=>{const input=nodes().filter(n=>n.type==='input'&&n.props.type==='email')[at];assert(input);input.props.onChange({target:{value}});view();};
 const submit=(at=0)=>{const form=nodes().filter(n=>n.type==='form')[at];assert(form);form.props.onSubmit({preventDefault(){}});};
 return{state,control,requests,events,storage,navigation,browser:globals,timers,load,view,nodes,change,submit,ready,advance,unmount,
  text:()=>nodes().filter(n=>typeof n==='string').join(' ').replace(/\s+/g,' ').trim(),
  strictEffects(){for(const c of contexts.values())for(const cell of c.cells)if(cell.fn){cell.cleanup?.();cell.cleanup=cell.fn();}},
  showPopup(){view();advance(5000);for(const fn of events.get('mouseleave')??[])fn({clientY:0});view();}
 };
}
const ack=()=>Response.json({ok:true,status:'accepted'},{status:202});
module.exports={fixture,ack,deferred,flush};
