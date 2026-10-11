'use strict';
const assert=require('node:assert/strict'),{harness,deferred,flush,reply}=require('./chat-widget-harness.cjs'),{load}=require('./route-harness.cjs'),{computeScore}=load('lib/optimize-score.ts');
const video=id=>({videoId:id,title:id==='synthetic01'?'Original synthetic title':'Second synthetic title',description:'Original description',tags:['synthetic'],thumbnail:'https://example.invalid/'+id,publishedAt:'2026-01-01T00:00:00Z',categoryId:'27',views:100,likes:5,comments:2});
const row=(owner,id='synthetic01')=>({id:'history01',userId:owner,videoId:id,field:'title',oldValue:'Before original',newValue:'After original',scoreBefore:0,scoreAfter:35,viewsBefore:0,viewsAfter:null,createdAt:'2026-10-01T00:00:00.000Z'});
function ack(r){
 const id=new URL(r.url,'https://example.invalid').searchParams.get('videoId'),base={userId:r.owner,email:r.email,selection:{videoId:id}};
 if(id){const v=video(id);return{...base,video:v,...computeScore(v.title,v.description,v.tags),history:[row(r.owner,id)]};}
 return{...base,requestedVideoIds:['synthetic01','synthetic02'],missingVideoIds:[],coverage:'complete',videos:['synthetic01','synthetic02'].map(id=>({...video(id),score:10}))};
}
function defaults(r){assert(r.init.method==='GET','Only original GETs allowed in read fixture');return reply(ack(r));}
const create=()=>{const h=harness({optimize:true});h.state.send=defaults;return h;};
const ready=async h=>{h.view();await flush();h.view();};
const reads=(h,id=null)=>h.requests.filter(r=>r.init.method==='GET'&&(id===null?r.url==='/api/youtube/optimize':r.url.includes('?videoId='+id)));
const choose=(h,id='synthetic01')=>h.nodes().find(n=>n.type==='button'&&n.props?.['data-video-id']===id);
async function open(h,id='synthetic01'){await ready(h);const b=choose(h,id);assert(b,'Missing selected video');b.props.onClick();await ready(h);}
const input=h=>h.nodes().find(n=>n.props?.placeholder===(h.state.lang==='en'?'Video title...':'Título del vídeo...'));
const retry=h=>h.button(h.state.lang==='en'?'Retry read':'Reintentar lectura');
const back=h=>h.nodes().find(n=>n.type==='button'&&h.text(n).includes(h.state.lang==='en'?'Back to list':'Volver a la lista'));
async function run(){
 const results=[],test=async(name,fn)=>{const h=create();try{await fn(h);results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.stack});}finally{h.unmount();}};
 await test('actual page installs exact list/detail/history and baseline; no POST/PUT, cache no-store',async h=>{await open(h);assert.equal(input(h).props.value,video('synthetic01').title);assert(h.text().includes('Before original'));assert.equal(reads(h).length,1);assert.equal(reads(h,'synthetic01').length,1);assert(h.requests.every(r=>r.init.cache==='no-store'&&r.init.signal===undefined));assert.equal(h.timers.size,0);});
 for(const id of [null,'synthetic01'])for(const held of ['headers','JSON'])await test((id?'detail':'list')+' '+held+'30s finite wait, late original and disabled replacement',async h=>{
  const gate=deferred();h.state.send=r=>(new URL(r.url,'https://example.invalid').searchParams.get('videoId')===id)?held==='headers'?gate.promise.then(()=>reply(ack(r))):{ok:true,status:200,json:()=>gate.promise.then(()=>ack(r))}:defaults(r);
  if(id)await open(h);else await ready(h);h.advance(30000);await ready(h);assert.match(h.text(),/No se pudieron cargar/);assert.match(h.text(),/lectura original sigue pendiente/);assert(retry(h).props.disabled);retry(h).props.onClick();assert.equal(reads(h,id).length,1);assert(!h.text().includes('búsqueda confirmada'));gate.resolve();await ready(h);if(id)assert(input(h));else assert(choose(h));assert.equal(reads(h,id).length,1);assert.equal(h.timers.size,0);
 });
 for(const id of [null,'synthetic01'])await test((id?'detail':'list')+' headers/JSON share original30s across Strict setup',async h=>{
  const headers=deferred(),body=deferred();h.state.send=r=>new URL(r.url,'https://example.invalid').searchParams.get('videoId')===id?headers.promise.then(()=>({ok:true,status:200,json:()=>body.promise.then(()=>ack(r))})):defaults(r);
  if(id)await open(h);else await ready(h);h.advance(20000);headers.resolve();await ready(h);h.strictEffects();h.advance(10000);await ready(h);assert(retry(h).props.disabled);assert.equal(reads(h,id).length,1);body.resolve();await ready(h);assert.equal(reads(h,id).length,1);
 });
 for(const id of [null,'synthetic01'])await test((id?'detail':'list')+' unmount/reselect live original retains deadline and sole producer',async h=>{
  const gate=deferred();h.state.send=r=>new URL(r.url,'https://example.invalid').searchParams.get('videoId')===id?{ok:true,status:200,json:()=>gate.promise.then(()=>ack(r))}:defaults(r);
  if(id)await open(h);else await ready(h);h.advance(20000);h.unmount();if(id)await open(h);else await ready(h);assert.equal(reads(h,id).length,1);h.advance(10000);await ready(h);assert(retry(h).props.disabled);gate.resolve();await ready(h);assert.equal(reads(h,id).length,1);assert(id?!!input(h):!!choose(h));
 });
 await test('detail back before terminal retires callbacks; reselect same pending original without new GET',async h=>{
  const gate=deferred();h.state.send=r=>r.url.includes('?')?gate.promise.then(()=>reply(ack(r))):defaults(r);await open(h);back(h).props.onClick();await ready(h);assert(!input(h));choose(h).props.onClick();await ready(h);assert.equal(reads(h,'synthetic01').length,1);gate.resolve();await ready(h);assert(input(h));assert.equal(reads(h).length,1);
 });
 await test('new video before old terminal cannot install old draft/history or run old selector twice',async h=>{
  const gate=deferred();h.state.send=r=>r.url.includes('synthetic01')?gate.promise.then(()=>reply(ack(r))):defaults(r);await ready(h);const old=choose(h).props.onClick;old();old();await ready(h);assert.equal(reads(h,'synthetic01').length,1);back(h).props.onClick();await ready(h);await open(h,'synthetic02');assert.equal(input(h).props.value,video('synthetic02').title);gate.resolve();await ready(h);assert.equal(input(h).props.value,video('synthetic02').title);assert.equal(reads(h,'synthetic02').length,1);
 });
 for(const id of [null,'synthetic01'])for(const reason of ['account','email','auth'])await test((id?'detail':'list')+' '+reason+' render-before-effects retires old result/selector/retry',async h=>{
  const gate=deferred();h.state.send=r=>new URL(r.url,'https://example.invalid').searchParams.get('videoId')===id?gate.promise.then(()=>reply(ack(r))):defaults(r);if(id)await open(h);else await ready(h);h.advance(30000);await ready(h);const oldRetry=retry(h).props.onClick,oldBack=id?back(h).props.onClick:null;if(reason==='account')h.state.user='neighbor';if(reason==='email')h.state.email='neighbor@example.invalid';if(reason==='auth')h.state.auth='unauthenticated';h.view(true);oldRetry();oldBack?.();gate.resolve();await flush();assert(!input(h));await ready(h);assert(!input(h));assert(h.requests.filter(r=>r.owner==='fixture-one'&&r.email==='fixture-one@example.invalid'&&(id?r.url.includes('?'):r.url==='/api/youtube/optimize')).length===1);
 });
 await test('language render retires old handlers, reattaches same pending body/budget and localizes failure',async h=>{
  const gate=deferred();h.state.send=r=>r.url.includes('?')?gate.promise.then(()=>reply(ack(r))):defaults(r);await open(h);h.advance(20000);const oldBack=back(h).props.onClick;h.state.lang='en';h.view(true);oldBack();await ready(h);assert(back(h));h.advance(10000);await ready(h);assert.match(h.text(),/original read is still pending/);assert(retry(h).props.disabled);gate.resolve();await ready(h);assert(input(h));assert.equal(reads(h,'synthetic01').length,1);
 });
 await test('validated current draft survives language change; retired old edit handler cannot overwrite it',async h=>{
  await open(h);input(h).props.onChange({target:{value:'Unsaved current draft'}});await ready(h);const old=input(h).props.onChange;h.state.lang='en';h.view(true);old({target:{value:'Obsolete edit'}});await ready(h);assert.equal(input(h).props.value,'Unsaved current draft');assert.equal(reads(h,'synthetic01').length,1);
 });
 await test('confirmed empty is distinct from partial0/2 and failure; original dates retained',async h=>{
  h.state.send=r=>reply({...ack(r),requestedVideoIds:[],videos:[]});await ready(h);assert.match(h.text(),/búsqueda confirmada/);h.unmount();h.state.send=r=>reply({...ack(r),videos:[],missingVideoIds:['synthetic01','synthetic02'],coverage:'partial'});await ready(h);assert.match(h.text(),/Datos parciales: 0\s*\/\s*2/);assert(!h.text().includes('búsqueda confirmada'));assert(!h.requests.some(r=>r.url.includes('?')));
 });
 await test('partial1/2 retains original search order, exact missing coverage and date',async h=>{
  h.state.send=r=>reply({...ack(r),videos:ack(r).videos.slice(0,1),missingVideoIds:['synthetic02'],coverage:'partial'});await ready(h);assert.match(h.text(),/Datos parciales: 1\s*\/\s*2/);assert(choose(h));assert(!choose(h,'synthetic02'));assert(h.text().includes('2026'));
 });
 const listEdits=[
  ['owner',b=>b.userId='foreign'],['email',b=>b.email='foreign@example.invalid'],['selection',b=>b.selection.videoId='synthetic01'],
  ['no-coverage',b=>delete b.coverage],['false-complete',b=>{b.missingVideoIds=['synthetic02'];b.videos.pop();}],
  ['missing-unrequested',b=>b.missingVideoIds=['foreign']],['duplicate-request',b=>b.requestedVideoIds.push('synthetic01')],
  ['duplicate-missing',b=>{b.missingVideoIds=['synthetic01','synthetic01'];b.videos=[];b.coverage='partial';}],
  ['out-of-order',b=>b.videos.reverse()],['foreign-video',b=>b.videos[0].videoId='foreign'],['unsafe-count',b=>b.videos[0].views=9007199254740992],
  ['negative-count',b=>b.videos[0].likes=-1],['wrong-count-type',b=>b.videos[0].views='100'],['score',b=>b.videos[0].score=101],
  ['overlong-title',b=>b.videos[0].title='x'.repeat(101)],['invalid-date',b=>b.videos[0].publishedAt='2026-02-30T00:00:00Z'],
  ['unsafe-thumbnail',b=>b.videos[0].thumbnail='javascript:alert(1)'],['credential-thumbnail',b=>b.videos[0].thumbnail='https://secret@example.invalid/image'],
  ['too-many-requests',b=>b.requestedVideoIds=Array.from({length:21},(_,i)=>'video'+i)],['missing-list',b=>delete b.videos],
 ];
 for(const[name,edit]of listEdits)await test('invalid list '+name+' cannot install selectors, empty or expose diagnostics',async h=>{h.state.send=r=>{const b=ack(r);edit(b);return reply(b);};await ready(h);assert(!choose(h));assert.match(h.text(),/No se pudieron cargar/);assert(!h.text().includes('búsqueda confirmada'));assert(!retry(h).props.disabled);});
 const detailEdits=[
  ['owner',b=>b.userId='foreign'],['email',b=>b.email=null],['selection',b=>b.selection.videoId='synthetic02'],['video',b=>b.video.videoId='synthetic02'],
  ['score-arithmetic',b=>b.score=100],['checks',b=>b.checks.pop()],['weight',b=>b.checks[0].w=7],
  ['unsafe-comments',b=>b.video.comments=Infinity],['missing-tags',b=>delete b.video.tags],['null-description',b=>b.video.description=null],
  ['history-owner',b=>b.history[0].userId='foreign'],['history-video',b=>b.history[0].videoId='synthetic02'],
  ['history-field',b=>b.history[0].field='accessToken'],['history-duplicate',b=>b.history.push(b.history[0])],
  ['history-score',b=>b.history[0].scoreAfter=101],['history-views',b=>b.history[0].viewsAfter=-1],
  ['history-date',b=>b.history[0].createdAt='invalid'],['history-order',b=>b.history.push({...b.history[0],id:'history02',createdAt:'2026-10-02T00:00:00Z'})],
  ['history-bound',b=>b.history=Array(21).fill(b.history[0])],['history-text',b=>b.history[0].newValue='x'.repeat(50001)],
 ];
 for(const[name,edit]of detailEdits)await test('invalid detail '+name+' cannot install editor/score/history or trigger POST/PUT',async h=>{h.state.send=r=>{const b=ack(r);if(r.url.includes('?'))edit(b);return reply(b);};await open(h);assert(!input(h));assert(!h.text().includes('Before original'));assert.match(h.text(),/No se pudieron cargar/);assert(!retry(h).props.disabled);assert(h.requests.every(r=>r.init.method==='GET'));});
 for(const id of [null,'synthetic01'])for(const fault of ['headers','JSON','201','401','503'])await test((id?'detail':'list')+' '+fault+' finite generic error and explicit terminal retry',async h=>{
  h.state.send=r=>new URL(r.url,'https://example.invalid').searchParams.get('videoId')===id?fault==='headers'?Promise.reject(Error('Private token diagnostics')):fault==='JSON'?{ok:true,status:200,json:()=>Promise.reject(Error('Private SQL'))}:reply({error:'Private token diagnostics'},Number(fault)):defaults(r);if(id)await open(h);else await ready(h);assert.match(h.text(),/No se pudieron cargar/);assert(!h.text().includes('Private'));assert(!retry(h).props.disabled);await ready(h);assert.equal(reads(h,id).length,1);h.state.send=defaults;const cb=retry(h).props.onClick;cb();cb();await ready(h);assert.equal(reads(h,id).length,2);assert(id?!!input(h):!!choose(h));assert.equal(h.timers.size,0);
 });
 for(const[status,code,match]of [[403,'pro_required',/requiere el plan Pro/],[400,'youtube_not_connected',/Conecta tu canal/],[404,'video_not_found',/vídeo seleccionado no está disponible/]])await test('localized safe HTTP'+status+' '+code+' without invented empty',async h=>{h.state.send=r=>r.url.includes('?')?reply({error:code},status):defaults(r);await open(h);assert.match(h.text(),match);assert(!input(h));});
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'Actual Optimize page/hooks/GET reader; fictitious HTTP/auth only, no PUT/POST/OAuth/Google/models/operational provenance/recovery',results};
}
module.exports={create,ready,open,reads,choose,input,retry,back,ack,defaults,video,row,run};
if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;});
