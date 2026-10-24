import 'server-only';
import {createOperationalWebComposition,type OperationalWebOptions} from './operational-composition.cjs';
import {installSharedRuntime} from './shared-runtime';
import type {SharedRuntimeReadiness} from './shared-runtime-bootstrap.cjs';
import type {createOperationalWebDeployment} from './operational-deployment.cjs';

const key=Symbol.for('ytubviral.ai.operational-web-capabilities.v1');
type Deployment=ReturnType<typeof createOperationalWebDeployment>;
type Provided={options:OperationalWebOptions|Deployment;signal?:AbortSignal;install:()=>Promise<Readonly<SharedRuntimeReadiness>>};
const server=globalThis as typeof globalThis & {[key]?:Readonly<Provided>};

// Called by the original trusted deployment bootstrap before instrumentation.
// Environment variables/JSON can request startup but cannot supply functions.
export function provideOperationalWebCapabilities(options:OperationalWebOptions,{signal}:{signal?:AbortSignal}={}):void{
 const previous=server[key];
 if(previous){if(previous.options!==options||previous.signal!==signal)throw new Error('Operational web bootstrap already has original capabilities');return;}
 const composition=createOperationalWebComposition(options);
 let original:Promise<Readonly<SharedRuntimeReadiness>>|undefined;
 const install=()=>original??=installSharedRuntime(composition.dependencies,{signal});
 Object.defineProperty(server,key,{value:Object.freeze({options,signal,install}),configurable:false,writable:false});
}
export function installConfiguredOperationalWebRuntime():Promise<Readonly<SharedRuntimeReadiness>>{
 const provided=server[key];
 if(!provided)throw new Error('Operational startup requires original server capabilities; configuration alone is insufficient');
 return provided.install();
}

// The concrete deployment owner constructs and probes the separate native role
// sessions. It must be supplied by trusted server code before instrumentation.
export function provideOperationalWebDeployment(deployment:Deployment,{signal}:{signal?:AbortSignal}={}):void{
 const previous=server[key];
 if(previous){if(previous.options!==deployment||previous.signal!==signal)throw new Error('Operational web bootstrap already has original capabilities');return;}
 if(typeof deployment?.prepare!=='function'||typeof deployment.assertOpen!=='function')throw new Error('Original web deployment owner required');
 const prepare=deployment.prepare.bind(deployment),dependencies=deployment.dependencies,checkBeforeInstall=deployment.assertOpen.bind(deployment);
 let original:Promise<Readonly<SharedRuntimeReadiness>>|undefined;
 const install=()=>original??=Promise.resolve().then(async()=>{await prepare({signal});checkBeforeInstall();return installSharedRuntime(dependencies,{signal,checkBeforeInstall});});
 Object.defineProperty(server,key,{value:Object.freeze({options:deployment,signal,install}),configurable:false,writable:false});
}
