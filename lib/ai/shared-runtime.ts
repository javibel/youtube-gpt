import 'server-only';
import { createSharedRuntimeBootstrap, type SharedRuntimeDependencies, type SharedRuntimeReadiness } from './shared-runtime-bootstrap.cjs';
import {types} from 'node:util';
import { createAuthenticatedConfigurationService, type SharedRuntimeBundle } from './configuration-runtime';

const registrationKey = Symbol.for('ytubviral.ai.shared-registration.v1');
const bundleKey = Symbol.for('ytubviral.ai.shared-runtime.v1');
const taskKey = Symbol.for('ytubviral.ai.task-runtime.v1');
const configurationKey = Symbol.for('ytubviral.ai.configuration-runtime.v1');
type PreparedRuntime=Awaited<ReturnType<ReturnType<typeof createSharedRuntimeBootstrap>['prepare']>>;
type Registration = { dependencies:SharedRuntimeDependencies; prepared?:PreparedRuntime; signal?:AbortSignal; checkBeforeInstall?:()=>void; promise:Promise<Readonly<SharedRuntimeReadiness>> };
const shared = globalThis as typeof globalThis & {[registrationKey]?:Readonly<Registration>;[bundleKey]?:Readonly<SharedRuntimeBundle>};
const vacant = () => {
 if ([bundleKey,taskKey,configurationKey].some(key => Object.hasOwn(shared,key))) throw new Error('A task or configuration runtime is already installed');
};

// Opt-in server composition. One atomic property publishes both capabilities;
// there is no interval in which only tasks or only administration is installed.
// Failed original preparations remain failed across duplicate server bundles.
export function installSharedRuntime(dependencies:SharedRuntimeDependencies, options:{signal?:AbortSignal;checkBeforeInstall?:()=>void;prepared?:PreparedRuntime} = {}):Promise<Readonly<SharedRuntimeReadiness>> {
 const signal=options.signal,checkBeforeInstall=options.checkBeforeInstall,prepared=options.prepared,original=shared[registrationKey];
 if(checkBeforeInstall!==undefined&&typeof checkBeforeInstall!=='function')throw new Error('An original installation guard is required');
 if(original){
  if(original.dependencies!==dependencies||original.prepared!==prepared||original.signal!==signal||original.checkBeforeInstall!==checkBeforeInstall)throw new Error('Shared registration already has original capabilities');
  return original.promise;
 }
 vacant();
 if(prepared!==undefined){
  if(!prepared||types.isProxy(prepared)||!Object.isFrozen(prepared))throw new Error('Original prepared runtime required');
  const d=Object.getOwnPropertyDescriptors(prepared),keys=['factory','configurationDependencies','readiness'] as const;
  if(Reflect.ownKeys(d).length!==keys.length||keys.some(k=>!Object.hasOwn(d[k]??{},'value'))||typeof d.factory.value!=='function'||types.isProxy(d.factory.value)||!d.configurationDependencies.value||!d.readiness.value)throw new Error('Original prepared runtime capabilities required');
 }
 const bootstrap=prepared===undefined?createSharedRuntimeBootstrap(dependencies):undefined;
 const promise=Promise.resolve().then(async()=>{
  // A native deployment already performed its bounded preparation. Publish
  // that SAME guarded factory/stores; never repeat metadata or rebuild an
  // unguarded task factory outside the original lifecycle owner.
  const candidate=prepared??await bootstrap!.prepare({signal});
  if(signal?.aborted)throw new Error('Shared preparation was cancelled');
  const bundle=Object.freeze({factory:candidate.factory,service:createAuthenticatedConfigurationService(candidate.configurationDependencies)});
  checkBeforeInstall?.();
  vacant();
  Object.defineProperty(shared,bundleKey,{value:bundle,writable:false,configurable:false});
  return candidate.readiness;
 });
 Object.defineProperty(shared,registrationKey,{value:Object.freeze({dependencies,prepared,signal,checkBeforeInstall,promise}),writable:false,configurable:false});
 return promise;
}
