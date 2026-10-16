'use strict';
const assert=require('node:assert/strict'),ui=require('./ab-page-client.test.cjs'),{reply,flush}=require('./chat-widget-harness.cjs');
const clients={suggestions:require('./ab-suggestions-native-client.test.cjs'),creation:require('./ab-create-native-client.test.cjs'),mutation:require('./ab-mutate-native-client.test.cjs')};
const longSession=h=>{h.state.expires=new Date(10000+30*86400000).toISOString();};
async function run(){const results=[];async function test(name,fn){try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}}
 for(const [kind,client]of Object.entries(clients)){
  await test(kind+': a 30-day native session cannot overflow the browser timer and discard its original completed receipt',async()=>{
   const h=client.harness({browserTimers:true});try{longSession(h);const original=h.begin(),receipt=await original.original;assert(original.read(receipt));h.advance(1);await flush();assert(original.read(receipt),'Original receipt retired immediately by signed 32-bit timer overflow');h.advance(2147483647);assert.equal(original.read(receipt),null,'The bounded timer may veto earlier; it never extends the native session or recovers a producer');}finally{await client.close(h);}
  });
  await test(kind+': the actual page displays the original ACK before any follow-up GET with a 30-day native session',async()=>{
   const h=ui.create({browserTimers:true});try{longSession(h);if(kind==='mutation')h.state.send=async r=>{const d=await ui.defaults(r).json();if(r.init.method==='GET'&&r.url==='/api/youtube/ab-test')d.tests=[clients.mutation.row(h)];return reply(d);};await ui.ready(h);
    if(kind!=='mutation'){ui.pick(h);h.view();}
    if(kind==='creation'){ui.inputs(h)[1].props.onChange({target:{value:'Candidate B'}});h.view();}
    await h.click(kind==='suggestions'?'Sugerir con IA':kind==='creation'?'Iniciar A/B test':'Cancelar test');h.advance(1);await ui.ready(h);
    if(kind==='suggestions')assert.equal(ui.values(h),'Original suggestion A|Original suggestion B');
    if(kind==='creation'){assert.match(h.text(),/Candidate B/);assert.equal(ui.inputs(h).length,0);}
    if(kind==='mutation')assert.match(h.text(),/CANCELADO/);
    assert.equal(h.requests.filter(r=>r.init.method==='GET').length,2,'No GET may adopt a missing native response');assert.equal(h.requests.filter(r=>r.init.method!=='GET').length,1,'Only one original command');
   }finally{h.unmount();await flush();assert.equal(h.timers.size,0);}
  });
 }
 return{status:results.every(r=>r.status==='PASS')?'PASS':'FAIL',scope:'HTML signed-32-bit timeout conversion and actual A/B page with unchanged long native expiry; no private receipt reconstruction, provider, browser focus substitution or SQL.',results};
}
module.exports={run};if(require.main===module)run().then(r=>{console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}).catch(error=>{console.error(error.stack);process.exitCode=1;});
