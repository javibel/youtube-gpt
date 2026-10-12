import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { isPaidStatus } from '@/lib/plans';
import type { Prisma } from '@prisma/client';

export const validSyncKey = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,128}$/.test(v);
type Input = { subscriptionId?: string | null };
export function validSyncInput(v: unknown, keyed: boolean): v is Input {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (!keyed && Object.keys(r).length === 0) return true;
  return Object.keys(r).length === 1 && Object.hasOwn(r,'subscriptionId') && (r.subscriptionId === null || validSyncKey(r.subscriptionId));
}
type Owner = { userId: string; email: string };
type Outcome = { ok: true; userId: string; email: string; key: string; selectedSubscriptionId: string | null;
  subscriptionId: string | null; synced: boolean; status: string | null; plan: string | null; mode: 'simulated' }
  | { ok: false; status: number; error: string };
const unconfirmed = (): Outcome => ({ ok: false, status: 503, error: 'sync_unconfirmed' });
const customerID = (v: unknown): v is string => typeof v === 'string' && /^cus_[A-Za-z0-9_-]{1,128}$/.test(v);
// Validate the runtime deletion flag as unknown: Stripe's Customer type marks
// this property void, while an untrusted fixture/response can still be deleted.
const deletedCustomer = (v: unknown): boolean => !!v && typeof v === 'object' && (v as Record<string,unknown>).deleted === true;
const priceID = (v: unknown): v is string => typeof v === 'string' && /^price_[A-Za-z0-9_-]{1,128}$/.test(v);
const seconds = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 8_640_000_000_000;
const statuses = ['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'];

// Only the live invocation that received its own committed admission may read
// the provider and write. Rows/keys/provider snapshots never resume an original
// or retire checkout. A complete checkout row does not prove payment.
export async function syncSubscriptionOriginal(owner: Owner, input: Input, key: string, check: () => void): Promise<Outcome> {
  try {
    check();
    if (!validSyncInput(input,false) || !validSyncKey(key) || !validSyncKey(owner.userId) || typeof owner.email !== 'string'
      || !owner.email || owner.email.length > 320) return {ok:false,status:400,error:'invalid_input'};
    const own = Object.freeze({userId:owner.userId,email:owner.email}), expected = Object.freeze({...input});
    const prices = Object.freeze([
      {id:process.env.STRIPE_PRO_PRICE_ID?.trim(),plan:'pro',interval:'month'},
      {id:process.env.STRIPE_PRO_YEARLY_PRICE_ID?.trim(),plan:'pro',interval:'year'},
      {id:process.env.STRIPE_BUSINESS_PRICE_ID?.trim(),plan:'business',interval:'month'},
      {id:process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID?.trim(),plan:'business',interval:'year'},
    ].map(p=>Object.freeze(p)));
    if (prices.some(p=>!priceID(p.id)) || new Set(prices.map(p=>p.id)).size !== 4) return {ok:false,status:500,error:'sync_price_unavailable'};
    const user = await prisma.user.findUnique({where:{id:own.userId},include:{subscription:true}}); check();
    if (!user || user.id !== own.userId || user.email !== own.email) return {ok:false,status:401,error:'Unauthorized'};
    const sub = user.subscription;
    if (sub && (!validSyncKey(sub.id) || sub.userId !== own.userId || !['free','pro','business'].includes(sub.plan)
      || !statuses.includes(sub.status) || typeof sub.cancelAtPeriodEnd !== 'boolean'
      || (sub.stripeCustomerId !== null && !customerID(sub.stripeCustomerId))
      || (sub.stripePriceId !== null && !priceID(sub.stripePriceId)))) return unconfirmed();
    const selected = Object.freeze({id:sub?.id??null,customer:sub?.stripeCustomerId??null,price:sub?.stripePriceId??null,
      plan:sub?.plan??null,status:sub?.status??null,cancel:sub?.cancelAtPeriodEnd??null,
      start:sub?.currentPeriodStart?.getTime()??null,end:sub?.currentPeriodEnd?.getTime()??null});
    if (Object.hasOwn(expected,'subscriptionId') && expected.subscriptionId !== selected.id) return unconfirmed();
    const captured = Object.freeze({id:randomUUID(),...own,key,subscriptionId:selected.id}), createdID = selected.id ?? randomUUID();
    const lock = async(tx:Prisma.TransactionClient)=>{
      check(); const owners = await tx.$queryRawUnsafe<Array<{id:string;email:string}>>('SELECT id,email FROM users WHERE id=$1 FOR UPDATE',own.userId); check();
      if (owners.length !== 1 || owners[0].id !== own.userId || owners[0].email !== own.email) throw Error('Sync unconfirmed');
      const rows = await tx.$queryRawUnsafe<Array<{id:string}>>('SELECT id FROM subscriptions WHERE "userId"=$1 FOR UPDATE',own.userId); check();
      if (rows.length !== (selected.id===null?0:1) || (selected.id !== null && rows[0]?.id !== selected.id)) throw Error('Sync unconfirmed');
      const latest = await tx.user.findUnique({where:{id:own.userId},include:{subscription:true}}); check();
      const s = latest?.subscription;
      if (!latest || latest.id !== own.userId || latest.email !== own.email || (s?.id??null)!==selected.id
        || (s?.stripeCustomerId??null)!==selected.customer || (s?.stripePriceId??null)!==selected.price
        || (s?.plan??null)!==selected.plan || (s?.status??null)!==selected.status || (s?.cancelAtPeriodEnd??null)!==selected.cancel
        || (s?.currentPeriodStart?.getTime()??null)!==selected.start || (s?.currentPeriodEnd?.getTime()??null)!==selected.end) throw Error('Sync unconfirmed');
    };
    const matches = (r:Record<string,unknown>|null)=>!!r && r.state==='pending' && Object.entries(captured).every(([k,v])=>r[k]===v);
    const admission = await prisma.$transaction(async tx=>{
      await lock(tx);
      const webhook = await tx.checkoutWebhookDenial.findUnique({ where: { userId: own.userId } });
      check(); if (webhook) throw Error("Webhook original reconciliation pending");
      const downgrade = await tx.subscriptionDowngradeAttempt.findUnique({where:{userId:own.userId}}); check(); if(downgrade)return null;
      const cancellation = await tx.subscriptionCancellationAttempt.findUnique({where:{userId:own.userId}}); check(); if(cancellation)return null;
      const checkout = await tx.checkoutAttempt.findUnique({where:{userId:own.userId}}); check(); if(checkout && checkout.state!=='complete')return null;
      const prior = await tx.subscriptionSyncAttempt.findUnique({where:{userId:own.userId}}); check(); if(prior)return null;
      const row = await tx.subscriptionSyncAttempt.create({data:{...captured,state:'pending'}}); check(); return row;
    },{maxWait:10_000,timeout:15_000});
    check(); if(!matches(admission))return unconfirmed();
    const result = await prisma.$transaction(async tx=>{
      await lock(tx);
      const webhook = await tx.checkoutWebhookDenial.findUnique({ where: { userId: own.userId } });
      check(); if (webhook) throw Error("Webhook original reconciliation pending");
      const attempt=await tx.subscriptionSyncAttempt.findUnique({where:{userId:own.userId}}); check();
      if(!matches(attempt))throw Error('Sync unconfirmed');
      const customers = await stripe.customers.list({email:own.email,limit:5}); check();
      if(!customers || customers.has_more!==false || !Array.isArray(customers.data) || customers.data.length>1)throw Error('Sync unconfirmed');
      let result:{subscriptionId:string|null;synced:boolean;status:string|null;plan:string|null}={subscriptionId:selected.id,synced:false,status:null,plan:null};
      if(customers.data.length){
        const customer=customers.data[0];
        if(!customerID(customer.id) || customer.email!==own.email || deletedCustomer(customer) || (selected.customer!==null && customer.id!==selected.customer))throw Error('Sync unconfirmed');
        const originalCustomer=customer.id;
        const listed=await stripe.subscriptions.list({customer:originalCustomer,status:'all',limit:10}); check();
        if(!listed || listed.has_more!==false || !Array.isArray(listed.data) || listed.data.length>10
          || listed.data.some(s=>!s || typeof s.id!=='string' || !/^sub_[A-Za-z0-9_-]{1,128}$/.test(s.id) || s.customer!==originalCustomer || !statuses.includes(s.status))
          || new Set(listed.data.map(s=>s.id)).size!==listed.data.length)throw Error('Sync unconfirmed');
        const paid=listed.data.filter(s=>isPaidStatus(s.status)); if(paid.length>1)throw Error('Sync unconfirmed');
        if(paid.length){
          const original=paid[0],item=original.items?.data?.[0],price=prices.find(p=>p.id===item?.price?.id);
          if(original.items?.data?.length!==1 || !item || !/^si_[A-Za-z0-9_-]{1,128}$/.test(item.id) || item.quantity!==1
            || !price || !['eur','usd'].includes(item.price.currency) || item.price.recurring?.interval!==price.interval
            || item.price.recurring?.interval_count!==1 || typeof original.cancel_at_period_end!=='boolean')throw Error('Sync unconfirmed');
          // Preserve explicit provider periods; missing data never becomes now.
          const periodItem=item as typeof item & {current_period_start?:number;current_period_end?:number};
          const start=original.current_period_start??periodItem.current_period_start??original.trial_start,
            end=(original.status==='trialing'?original.trial_end:null)??original.current_period_end??periodItem.current_period_end??original.trial_end;
          if(!seconds(start)||!seconds(end)||start>=end)throw Error('Sync unconfirmed');
          const data=Object.freeze({stripeCustomerId:originalCustomer,stripePriceId:price.id!,plan:price.plan,status:original.status,
            cancelAtPeriodEnd:original.cancel_at_period_end,currentPeriodStart:new Date(start*1000),currentPeriodEnd:new Date(end*1000)});
          check();
          if(selected.id===null){
            const created=await tx.subscription.create({data:{id:createdID,userId:own.userId,...data}}); check();
            if(created.id!==createdID || created.userId!==own.userId || created.stripeCustomerId!==data.stripeCustomerId || created.stripePriceId!==data.stripePriceId
              || created.plan!==data.plan || created.status!==data.status || created.cancelAtPeriodEnd!==data.cancelAtPeriodEnd
              || created.currentPeriodStart?.getTime()!==data.currentPeriodStart.getTime() || created.currentPeriodEnd?.getTime()!==data.currentPeriodEnd.getTime())throw Error('Sync unconfirmed');
          }else{
            const stored=await tx.subscription.updateMany({where:{id:selected.id,userId:own.userId,stripeCustomerId:selected.customer,stripePriceId:selected.price,
              plan:selected.plan!,status:selected.status!,cancelAtPeriodEnd:selected.cancel!,currentPeriodStart:selected.start===null?null:new Date(selected.start),currentPeriodEnd:selected.end===null?null:new Date(selected.end)},data});
            check(); if(stored.count!==1)throw Error('Sync unconfirmed');
          }
          result={subscriptionId:createdID,synced:true,status:data.status,plan:data.plan};
        }
      }
      const marked=await tx.subscriptionSyncAttempt.updateMany({where:{...captured,state:'pending'},data:{state:'complete'}}); check();
      if(marked.count!==1)throw Error('Sync unconfirmed');return result;
    },{maxWait:10_000,timeout:55_000});
    check(); return Object.freeze({ok:true,...own,key,selectedSubscriptionId:selected.id,...result,mode:'simulated'});
  }catch{return unconfirmed();}
}
