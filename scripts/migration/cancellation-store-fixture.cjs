'use strict';
// Unit SQL fixture only; native tests exercise the actual unique index and locks.
module.exports=(user,options={})=>{
 const base=require('./checkout-store-fixture.cjs')(user);let row=null;
 const cancellation={findUnique:async()=>row,create:async q=>{if(row)throw Error('Duplicate admission');return row={...q.data};},updateMany:async q=>{if(!row||!Object.entries(q.where).every(([k,v])=>row[k]===v))return{count:0};row.state=q.data.state;return{count:1};}};
 const tx={...base,subscriptionCancellationAttempt:cancellation,$queryRawUnsafe:async sql=>!user?[]:sql.includes('FROM subscriptions')?user.subscription?[{id:user.subscription.id}]:[]:[user],
  subscription:{updateMany:async q=>{await options.onWrite?.(q);const sub=user?.subscription;if(!sub||!Object.entries(q.where).every(([k,v])=>sub[k]===v))return{count:0};sub.cancelAtPeriodEnd=q.data.cancelAtPeriodEnd;return{count:1};}}};
 return{...tx,$transaction:async fn=>{const prior=row&&{...row},cancel=user?.subscription?.cancelAtPeriodEnd;try{return await base.$transaction(()=>fn(tx));}catch(e){row=prior;if(user?.subscription)user.subscription.cancelAtPeriodEnd=cancel;throw e;}}};
};
