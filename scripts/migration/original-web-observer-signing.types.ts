import {createPlatformWebDeployment,type PlatformWebDeploymentOptions,type OriginalWebObserverSigningCapability} from '../../lib/ai/platform-web-deployment.cjs';
import {registerOriginalNativePlatformWebHostConfiguration,type OriginalNativePlatformWebHostConfiguration} from '../../lib/ai/platform-web-host-registration.cjs';
import type {ObserverRequestData} from '../../contracts/ai/v1/observer-channel.cjs';
declare const original:OriginalNativePlatformWebHostConfiguration;
declare const options:PlatformWebDeploymentOptions;
declare const capability:OriginalWebObserverSigningCapability;
declare const request:ObserverRequestData;
registerOriginalNativePlatformWebHostConfiguration({...original,deployment:{...original.deployment,observerSigning:capability}},{prepareTimeoutMs:1000,stopTimeoutMs:100});
const owner=createPlatformWebDeployment({...options,observerSigning:capability});
const signed:Promise<Readonly<{scope:'signature-only-no-authority';trust:'untrusted-observer-data';identity:Readonly<{peerId:string;keyId:string;spkiSha256:string}>;wire:string}>>=owner.signObserverRequest(request,{signal:new AbortController().signal});
void signed;
// @ts-expect-error Serialized signer data cannot supply an original function.
createPlatformWebDeployment({...options,observerSigning:{...capability,sign:'JSON'}});
// @ts-expect-error A signing capability must retain its original stop function.
createPlatformWebDeployment({...options,observerSigning:{policy:capability.policy,identity:capability.identity,clock:capability.clock,authorizeSigning:capability.authorizeSigning,sign:capability.sign}});
// @ts-expect-error Body flags cannot authorize signing orselect keys.
owner.signObserverRequest(request,{grant:true});
