'use strict';
const assert=require('node:assert/strict'),{fixture,ack}=require('./affiliate-application-client-harness.cjs');
async function run(){const results=[];
 for(const [name,status,body,accepted]of [['exact receipt',202,{ok:true,status:'accepted'},true],['old201',201,{ok:true},false],['empty202',202,{},false],['mixed202',202,{ok:true,status:'accepted',approved:true},false],['unknown503',503,{error:'PRIVATE_DIAGNOSTIC'},false]]){
  const h=fixture();h.control.fetch=()=>Response.json(body,{status});await h.ready();for(const[id,value]of [['name','Synthetic'],['email','synthetic@example.invalid'],['channelInfo','Own synthetic channel']]){h.nodes().find(n=>n.props?.name===id).props.onChange({target:{value}});h.view();}
  for(const label of h.nodes().filter(n=>n.type==='label'))assert(h.nodes().some(n=>n.props?.id===label.props.htmlFor));
  assert.equal(h.nodes().find(n=>n.props?.name==='email').props.autoComplete,'email');assert.equal(h.nodes().find(n=>n.props?.name==='email').props.maxLength,254);
  const form=h.nodes().find(n=>n.type==='form');await form.props.onSubmit({preventDefault(){}});await h.ready();assert.equal(h.requests.length,1);const req=h.requests[0];
  assert.equal(req.init.credentials,'omit');assert.equal(req.init.redirect,'error');assert.equal(req.init.cache,'no-store');assert.equal(h.storage.size+h.navigation.length,0);
  assert.equal(h.text().includes('Solicitud recibida.'),accepted);if(accepted){assert.match(h.text(),/no confirma aprobación ni entrega/);assert(!h.text().includes('1-2 días'));}else{assert.match(h.text(),/sin confirmar/);assert(!h.text().includes('PRIVATE_DIAGNOSTIC'));}
  h.unmount();results.push({name:'actual affiliate frontend ACK '+name+', labels and no approval/date promise',status:'PASS'});
 }
 return{status:'PASS',scope:'Actual affiliate TSX response/label adaptation with closed hooks/native response; bounded original HTTP/Reader/context and shared exclusion implemented; full context regressions in affiliate-client-original.test.cjs. No browser, dormant program activation, terms/copy/pricing/consent/approval/delivery acceptance.',results};
}
module.exports={run};if(require.main===module)run().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.stack);process.exitCode=1;});
