import 'server-only';
import { createConfigurationRuntimeBootstrap, type AdministrativeConfigurationDependencies, type AdministrativeConfigurationReadiness } from './configuration-runtime-bootstrap.cjs';
import { installConfigurationRuntime, getConfigurationService } from './configuration-runtime';

const registrationKey = Symbol.for('ytubviral.ai.configuration-registration.v1');
type Registration = {dependencies:AdministrativeConfigurationDependencies;signal?:AbortSignal;promise:Promise<Readonly<AdministrativeConfigurationReadiness>>};
const shared = globalThis as typeof globalThis & {[registrationKey]?:Readonly<Registration>};

// Explicit trusted composition only; never imported into startup. Duplicate
// bundles observe the original preparation/service, including its preview map.
export function installAdministrativeConfigurationRuntime(dependencies:AdministrativeConfigurationDependencies, options:{signal?:AbortSignal} = {}):Promise<Readonly<AdministrativeConfigurationReadiness>> {
 const signal=options.signal,original=shared[registrationKey];
 if(original){
  if(original.dependencies!==dependencies||original.signal!==signal)throw new Error('Administrative registration already has original capabilities');
  return original.promise;
 }
 if(getConfigurationService())throw new Error('Configuration runtime is already installed');
 const bootstrap=createConfigurationRuntimeBootstrap(dependencies);
 const promise=Promise.resolve().then(async()=>{
  const candidate=await bootstrap.prepare({signal});
  if(signal?.aborted)throw new Error('Administrative preparation was cancelled');
  installConfigurationRuntime(candidate.dependencies);
  return candidate.readiness;
 });
 Object.defineProperty(shared,registrationKey,{value:Object.freeze({dependencies,signal,promise}),writable:false,configurable:false});
 return promise;
}
