import 'server-only';
import {createPlatformWebDeployment,type PlatformWebDeploymentOptions} from './platform-web-deployment.cjs';
import {provideOperationalWebDeployment} from './operational-runtime';

// Trusted server code must call this
// explicitly BEFORE instrumentation; environment/JSON cannot supply functions.
const key=Symbol.for('ytubviral.ai.platform-web-bootstrap.v1');
type Owner=ReturnType<typeof createPlatformWebDeployment>;
type Original=Readonly<{options:PlatformWebDeploymentOptions;signal?:AbortSignal;owner:Owner}>;
const server=globalThis as typeof globalThis & {[key]?:Original};
export function providePlatformWebDeployment(options:PlatformWebDeploymentOptions,{signal}:{signal?:AbortSignal}={}):Owner{
 const previous=server[key];
 if(previous){if(previous.options!==options||previous.signal!==signal)throw new Error('Platform bootstrap already has original capabilities');previous.owner.assertOpen();return previous.owner;}
 if(signal!==undefined&&(!(signal instanceof AbortSignal)||signal.aborted))throw new Error('Platform bootstrap requires a live original signal');
 const owner=createPlatformWebDeployment(options);
 signal?.addEventListener('abort',()=>{void owner.close().catch(()=>{});},{once:true});
 if(signal?.aborted){void owner.close().catch(()=>{});throw new Error('Platform bootstrap original signal was cancelled');}
 try{provideOperationalWebDeployment(owner,{signal});}
 catch(error){void owner.close().catch(()=>{});throw error;}
 Object.defineProperty(server,key,{value:Object.freeze({options,signal,owner}),configurable:false,writable:false});
 return owner;
}
