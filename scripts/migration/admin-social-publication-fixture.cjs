'use strict';
const crypto=require('node:crypto'),{fixture,reached,drain}=require('./admin-social-draft-fixture.cjs');
const target=()=>String(BigInt('0x'+crypto.randomBytes(12).toString('hex')));
function compose(b,{offset=86400000}={}){
 b.clock.offset=offset;const mod=b.load('lib/admin-social-publication.ts');
 b.route=b.load('app/api/agent/run/route.ts',{'next/server':{NextResponse:Response},'@/lib/auth-guards':b.f.guard,'@/lib/admin-social-publication':mod,'@/lib/admin-social-preview-native':{},'@/lib/agent/gmail-agent':{runGmailAgent(){throw Error('No mail');}},'@/lib/agent/youtube-agent':{runYoutubeAgent(){throw Error('No YouTube');}}});
 b.http=request=>b.route.POST(request??b.make());
 b.start=async(respond=async result=>{b.calls.push('responder');b.result=result;return result;})=>{const parent=await b.native.authorizeNativeAdminSocialPublish(b.make());b.parent=parent;if(!parent)throw Error('social_publish_unconfirmed');return mod.runAdminSocialPublication(parent,respond);};b.publication=mod;return b;
}
async function controller(o={}){return compose(await fixture({image:true,page:target(),ig:target(),authOptions:{settings:{session:{strategy:'jwt',maxAge:3*86400}}},...o}),o);}
module.exports={compose,controller,target,reached,drain};
