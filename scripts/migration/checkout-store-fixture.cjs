'use strict';
// Unit-only SQL fixture. Native tests below exercise real constraints/locks.
module.exports=user=>{
 let row=null;
 const attempt={findUnique:async()=>row,create:async q=>{if(row)throw Error('Duplicate synthetic admission');return row={...q.data};},updateMany:async q=>{if(!row||!Object.entries(q.where).every(([k,v])=>row[k]===v))return{count:0};row.state=q.data.state;return{count:1};}};
 const db={user:{findUnique:async()=>user},checkoutAttempt:attempt,subscriptionSyncAttempt:{findUnique:async()=>null},subscriptionCancellationAttempt:{findUnique:async()=>null},subscriptionDowngradeAttempt:{findUnique:async()=>null},$queryRawUnsafe:async()=>user?[user]:[],
  $transaction:async fn=>{const prior=row&&{...row};try{return await fn(db);}catch(e){row=prior;throw e;}}};
 return db;
};
