'use strict';
// Closed native HTTP fixture; the legacy-shaped packet is assertion data only.
const {load}=require('./route-harness.cjs');
function domain(options={}){
 return load('lib/send-email.ts',{}, {process:{env:options.noProvider?{}:{RESEND_API_KEY:'SYNTHETIC_NOT_A_SECRET'}},
 fetch:async(url,init)=>{
  if(url!=='https://api.resend.com/emails')throw Error('Unexpected synthetic endpoint');
  const body=JSON.parse(init.body);
  const packet={...body,to:body.to[0]},settings={idempotencyKey:init.headers['Idempotency-Key']};
  if(!options.send)throw Error('Unbound native fixture transport');
  return options.send(packet,settings,init,url);
 }});
}
const password=(options={})=>load('lib/password-change-notice.ts',{'@/lib/send-email':domain(options),
 '@/lib/emails':options.templates??{passwordChangedEmail:load('lib/emails.ts').passwordChangedEmail}});
const invitation=(options={})=>load('lib/team-invitation-email.ts',{'@/lib/send-email':domain(options)});
module.exports={domain,password,invitation};
