import 'server-only';
import { createSharedRuntimeBootstrap, type SharedRuntimeDependencies, type SharedRuntimeReadiness } from './shared-runtime-bootstrap.cjs';
import { createAuthenticatedConfigurationService, type SharedRuntimeBundle } from './configuration-runtime';

const registrationKey = Symbol.for('ytubviral.ai.shared-registration.v1');
const bundleKey = Symbol.for('ytubviral.ai.shared-runtime.v1');
const taskKey = Symbol.for('ytubviral.ai.task-runtime.v1');
const configurationKey = Symbol.for('ytubviral.ai.configuration-runtime.v1');
type Registration = { dependencies:SharedRuntimeDependencies; signal?:AbortSignal; checkBeforeInstall?:()=>void; promise:Promise<Readonly<SharedRuntimeReadiness>> };
const shared = globalThis as typeof globalThis & {[registrationKey]?:Readonly<Registration>;[bundleKey]?:Readonly<SharedRuntimeBundle>};
const vacant = () => {
 if ([bundleKey,taskKey,configurationKey].some(key => Object.hasOwn(shared,key))) throw new Error('A task or configuration runtime is already installed');
};

// Opt-in server composition. One atomic property publishes both capabilities;
// there is no interval in which only tasks or only administration is installed.
// Failed original preparations remain failed across duplicate server bundles.
export function installSharedRuntime(dependencies:SharedRuntimeDependencies, options:{signal?:AbortSignal;checkBeforeInstall?:()=>void} = {}):Promise<Readonly<SharedRuntimeReadiness>> {
 const signal=options.signal,checkBeforeInstall=options.checkBeforeInstall,original=shared[registrationKey];
 if(checkBeforeInstall!==undefined&&typeof checkBeforeInstall!=='function')throw new Error('An original installation guard is required');
 if(original){
  if(original.dependencies!==dependencies||original.signal!==signal||original.checkBeforeInstall!==checkBeforeInstall)throw new Error('Shared registration already has original capabilities');
  return original.promise;
 }
 vacant();
 const bootstrap=createSharedRuntimeBootstrap(dependencies);
 const promise=Promise.resolve().then(async()=>{
  const candidate=await bootstrap.prepare({signal});
  if(signal?.aborted)throw new Error('Shared preparation was cancelled');
  const bundle=Object.freeze({factory:candidate.factory,service:createAuthenticatedConfigurationService(candidate.configurationDependencies)});
  checkBeforeInstall?.();
  vacant();
  Object.defineProperty(shared,bundleKey,{value:bundle,writable:false,configurable:false});
  return candidate.readiness;
 });
 Object.defineProperty(shared,registrationKey,{value:Object.freeze({dependencies,signal,checkBeforeInstall,promise}),writable:false,configurable:false});
 return promise;
}
