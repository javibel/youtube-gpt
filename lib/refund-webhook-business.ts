import { prisma } from '@/lib/prisma';
import { captureWebhookData, WebhookInputError } from '@/lib/stripe-webhook-contract';
import { captureCheckoutPrices, captureCheckoutSubscription, captureCheckoutCustomer } from '@/lib/checkout-webhook-business';
const id = (v: unknown, prefix: string): v is string => typeof v === 'string' && v.length <= 128 && new RegExp('^' + prefix + '_[A-Za-z0-9_]+$').test(v);
const rowId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const seconds = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 253402300799;
const amount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const invalid = () => { throw new WebhookInputError(400, 'Reembolso inconsistente'); };
const pending = () => { throw new WebhookInputError(503, 'Reembolso pendiente de conciliación original'); };
function reference(v: any, prefix: string, object: string) {
  if (typeof v === 'string') return id(v,prefix) ? v : invalid();
  return v && v.object === object && id(v.id,prefix) && (v.deleted === undefined || v.deleted === false) ? v.id : invalid();
}
function pair(primary: unknown, item: unknown) {
  if (primary != null && !seconds(primary)) return invalid();
  if (item != null && !seconds(item)) return invalid();
  if (primary != null && item != null && primary !== item) return invalid();
  return primary ?? item;
}
// Declared data only. No amount, paid/refunded flag, row or timestamp grants
// reversal, payout/clawback, entitlement, delivery ownership or recovery authority.
export function refundEventProjection(event: any, check: () => void) {
  event = captureWebhookData(event, check);
  if (!event || event.type !== 'charge.refunded') return invalid();
  const charge = event.data?.object;
  if (!charge || charge.object !== 'charge' || !id(charge.id,'ch') ||
      charge.status !== 'succeeded' || charge.paid !== true || charge.captured !== true ||
      typeof charge.refunded !== 'boolean' || !['eur','usd'].includes(charge.currency) ||
      !seconds(charge.created) || !amount(charge.amount) || charge.amount === 0 ||
      !amount(charge.amount_captured) || charge.amount_captured === 0 || charge.amount_captured > charge.amount ||
      !amount(charge.amount_refunded) || charge.amount_refunded === 0 || charge.amount_refunded > charge.amount_captured) return invalid();
  if (charge.amount_captured !== charge.amount) return pending(); // Partial capture needs a separate contract.
  if (charge.refunded !== (charge.amount_refunded === charge.amount)) return invalid();
  if (charge.invoice === null) return null; // Explicit non-invoice charge; no invoice commission action.
  const invoiceId = reference(charge.invoice,'in','invoice'),customerId = reference(charge.customer,'cus','customer'),
    paymentIntentId = reference(charge.payment_intent,'pi','payment_intent'),refunds = charge.refunds;
  if (!refunds || refunds.object !== 'list' || refunds.has_more !== false || !Array.isArray(refunds.data) || refunds.data.length !== 1) return pending();
  const refund = refunds.data[0];
  if (!refund || refund.object !== 'refund' || !id(refund.id,'re') ||
      reference(refund.charge,'ch','charge') !== charge.id ||
      reference(refund.payment_intent,'pi','payment_intent') !== paymentIntentId ||
      refund.currency !== charge.currency || !amount(refund.amount) || refund.amount !== charge.amount_refunded ||
      !seconds(refund.created) || refund.created < charge.created ||
      !['pending','requires_action','succeeded','failed','canceled'].includes(refund.status)) return invalid();
  if (refund.status !== 'succeeded') return pending();
  check();
  return Object.freeze({ chargeId:charge.id,invoiceId,customerId,paymentIntentId,refundId:refund.id,
    chargeCreatedSeconds:charge.created,refundCreatedSeconds:refund.created,currency:charge.currency,
    amountCents:charge.amount,amountCapturedCents:charge.amount_captured,amountRefundedCents:charge.amount_refunded,
    refundStatus:refund.status,fullyRefunded:charge.refunded,writeAuthorized:false as const });
}
export function refundInvoiceProjection(charge: NonNullable<ReturnType<typeof refundEventProjection>>, input: unknown, check: () => void) {
  charge = captureWebhookData(charge,check);const invoice = captureWebhookData(input,check);
  if (!invoice || invoice.object !== 'invoice' || invoice.id !== charge.invoiceId || invoice.status !== 'paid' || invoice.paid !== true ||
      invoice.currency !== charge.currency || reference(invoice.customer,'cus','customer') !== charge.customerId ||
      reference(invoice.payment_intent,'pi','payment_intent') !== charge.paymentIntentId ||
      reference(invoice.charge,'ch','charge') !== charge.chargeId || !seconds(invoice.created) ||
      invoice.created > charge.chargeCreatedSeconds || !amount(invoice.amount_paid) || !amount(invoice.amount_due) || invoice.amount_remaining !== 0) return invalid();
  if (invoice.amount_paid !== charge.amountCapturedCents) return pending(); // No guess for credits/multiple payments.
  if (invoice.subscription === null) return pending(); // An invoice charge is not proof of a subscription or commission.
  const subscriptionId = reference(invoice.subscription,'sub','subscription');
  if (!['subscription_create','subscription_cycle'].includes(invoice.billing_reason)) return pending();
  const lines=invoice.lines;
  if (!lines || lines.object !== 'list' || lines.has_more !== false || !Array.isArray(lines.data) || lines.data.length !== 1) return pending();
  const line=lines.data[0],price=line?.price;
  if (!line || line.object !== 'line_item' || !id(line.id,'il') || line.type !== 'subscription' || line.proration !== false ||
      line.quantity !== 1 || line.currency !== charge.currency || (line.invoice != null && line.invoice !== charge.invoiceId) ||
      reference(line.subscription,'sub','subscription') !== subscriptionId || !amount(line.amount) ||
      !price || price.object !== 'price' || !id(price.id,'price') || price.currency !== charge.currency ||
      !['month','year'].includes(price.recurring?.interval) || price.recurring?.interval_count !== 1 ||
      !seconds(line.period?.start) || !seconds(line.period?.end) || line.period.start >= line.period.end) return invalid();
  const itemId=reference(line.subscription_item,'si','subscription_item');check();
  return Object.freeze({...charge,subscriptionId,itemId,priceId:price.id,interval:price.recurring.interval,
    invoiceCreatedSeconds:invoice.created,invoiceAmountPaidCents:invoice.amount_paid,invoiceAmountDueCents:invoice.amount_due,
    lineAmountCents:line.amount,invoicePeriodStartSeconds:line.period.start,invoicePeriodEndSeconds:line.period.end,writeAuthorized:false as const});
}
export async function preflightRefundBusiness(invoice: ReturnType<typeof refundInvoiceProjection>, subscription: unknown, customer: unknown,
    prices: ReturnType<typeof captureCheckoutPrices>, check: () => void) {
  invoice=captureWebhookData(invoice,check);prices=captureWebhookData(prices,check);
  if (!prices || !Array.isArray(prices)) return pending();
  const sub=captureCheckoutSubscription(subscription,check),ownCustomer=captureCheckoutCustomer(customer,check),userId=sub.metadata?.userId;
  if (sub.object !== 'subscription' || sub.id !== invoice.subscriptionId || reference(sub.customer,'cus','customer') !== invoice.customerId ||
      !rowId(userId) || sub.metadata?.service !== 'YTubViral.com' ||
      !['active','trialing','past_due','unpaid','incomplete','canceled','incomplete_expired','paused'].includes(sub.status) ||
      typeof sub.cancel_at_period_end !== 'boolean' || ownCustomer.object !== 'customer' || ownCustomer.id !== invoice.customerId ||
      !(ownCustomer.deleted === undefined || ownCustomer.deleted === false) || ownCustomer.metadata?.userId !== userId ||
      typeof ownCustomer.email !== 'string' || !ownCustomer.email || ownCustomer.email.length > 320 ||
      /[\u0000-\u0020\u007f]/.test(ownCustomer.email)) return invalid();
  const items=sub.items;
  if (!items || items.object !== 'list' || items.has_more !== false || !Array.isArray(items.data) || items.data.length !== 1) return invalid();
  const item=items.data[0],price=item?.price,selected=prices.find(p=>p.id === price?.id);
  if (!item || item.object !== 'subscription_item' || !id(item.id,'si') || item.quantity !== 1 ||
      !price || price.object !== 'price' || !selected || sub.metadata.plan !== selected.plan ||
      !['eur','usd'].includes(sub.currency) || price.currency !== sub.currency ||
      price.recurring?.interval !== selected.interval || price.recurring?.interval_count !== 1) return invalid();
  if (item.id !== invoice.itemId || selected.id !== invoice.priceId || sub.currency !== invoice.currency || selected.interval !== invoice.interval) return pending();
  for (const ts of [sub.trial_start,sub.trial_end]) if (ts != null && !seconds(ts)) return invalid();
  let start=pair(sub.current_period_start,item.current_period_start),end=pair(sub.current_period_end,item.current_period_end);
  if (sub.status === 'trialing') { if (!seconds(sub.trial_end) || (end != null && end !== sub.trial_end)) return invalid();end=sub.trial_end;start ??= sub.trial_start; }
  if (!seconds(start) || !seconds(end) || start >= end) return invalid();
  // A historical invoice may differ from the current period. Neither is renewed.
  const projected=Object.freeze({...invoice,userId,email:ownCustomer.email,plan:selected.plan,status:sub.status,
    cancelAtPeriodEnd:sub.cancel_at_period_end,subscriptionPeriodStartSeconds:start,subscriptionPeriodEndSeconds:end,writeAuthorized:false as const});
  const linked=await prisma.$transaction(async tx=>{
    check();
    const owner=await tx.user.findUnique({where:{id:userId},include:{subscription:true}});check();
    if (!owner || owner.id !== userId || owner.email !== projected.email || !owner.subscription ||
        owner.subscription.userId !== userId || owner.subscription.stripeCustomerId !== projected.customerId || !rowId(owner.subscription.id)) return pending();
    const linkedRowId=owner.subscription.id;
    const rows=await tx.subscription.findMany({where:{stripeCustomerId:projected.customerId},select:{id:true,userId:true,stripeCustomerId:true},orderBy:{id:'asc'},take:2});check();
    if (rows.length !== 1 || rows[0].id !== linkedRowId || rows[0].userId !== userId || rows[0].stripeCustomerId !== projected.customerId) return pending();
    const commission=await tx.affiliateCommission.findUnique({where:{stripeInvoiceId:projected.invoiceId},select:{
      id:true,affiliateId:true,referredUserId:true,stripeInvoiceId:true,invoiceAmountCents:true,commissionCents:true,status:true,paidAt:true}});check();
    if (commission === null) return Object.freeze({linkedRowId,commission:null});
    if (!commission || !rowId(commission.id) || !rowId(commission.affiliateId) || commission.referredUserId !== userId ||
        commission.stripeInvoiceId !== projected.invoiceId || !amount(commission.invoiceAmountCents) || !amount(commission.commissionCents) ||
        !['pending','approved','paid','reversed'].includes(commission.status)) return pending();
    let paidAt:string|null=null;
    if (commission.paidAt !== null) {
      let millis:number;try { millis=Date.prototype.getTime.call(commission.paidAt); } catch { return pending(); }
      if (!Number.isFinite(millis)) return pending();
      paidAt=new Date(millis).toISOString();
    }
    if (commission.status === 'paid' && paidAt === null) return pending();
    return Object.freeze({linkedRowId,commission:Object.freeze({...commission,paidAt})});
  },{isolationLevel:'RepeatableRead',maxWait:5000,timeout:10000});
  check();
  return Object.freeze({...projected,...linked,writeAuthorized:false as const}); // Never invert money, compute partial commission or admit reversal.
}
