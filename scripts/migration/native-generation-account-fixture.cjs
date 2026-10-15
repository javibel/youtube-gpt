'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),bcrypt=require('bcryptjs'),{load}=require('./route-harness.cjs');

// Only newly created, owned synthetic accounts. The original password grant and
// mint acknowledgement supply the credential; no row/DTO can recreate either.
module.exports=async function(prisma,prefix,count){
 const credentials=new WeakMap(),tokens=new WeakMap(),attempted=new WeakSet(),users=[];
 for(let n=0;n<count;n++){
  const id=crypto.randomUUID(),email=prefix+'-'+id+'@example.invalid',password='closed-native-'+crypto.randomUUID();
  const user=await prisma.user.create({data:{id,email,password:await bcrypt.hash(password,8),emailVerified:new Date()}});
  credentials.set(user,{email,password});users.push(user);
 }
 const globals={Date,Headers,TextEncoder,AbortController},plans=load('lib/plans.ts',{'@/lib/prisma':{prisma}},globals);
 const issuer=load('lib/extension-token-native-authorization.ts',{
  'node:crypto':crypto,'@/lib/prisma':{prisma},'@/lib/plans':plans,bcryptjs:bcrypt,
  '@/lib/native-user-session':{readNativeVerifiedUser(){throw Error('No cookie recovery in native SQL fixture');}},
  '@/lib/admin-email':{ADMIN_EMAIL:'other-admin@example.invalid'},
 },globals);
 return{users,async issue(){
  for(const user of users){
   assert(!attempted.has(user),'The original fixture issuer cannot be retried');attempted.add(user);
   const grant=await issuer.authorizeNativeExtensionPassword(credentials.get(user),()=>{});
   credentials.delete(user);assert(grant&&typeof grant==='object');
   const minted=await issuer.mintNativeExtensionToken(grant,crypto.randomUUID(),()=>{});
   assert(minted&&/^[a-f0-9]{64}$/.test(minted.token));tokens.set(user,minted.token);
  }
 },request(user,request){
  assert(tokens.has(user),'No acknowledged original credential for this fixture object');
  const headers=new Headers(request.headers);assert(!headers.has('authorization'));headers.set('authorization','Bearer '+tokens.get(user));
  return new Request(request,{headers});
 }};
};
