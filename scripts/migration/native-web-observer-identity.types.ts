import {createNativePlatformBindings,type NativePlatformObserverIdentityOptions,type NativePlatformBindingsOptions} from '../../lib/ai/adapters/native-platform-bindings.cjs';
import {registerOriginalNativePlatformWebHostConfiguration,type OriginalNativePlatformWebHostConfiguration} from '../../lib/ai/platform-web-host-registration.cjs';
import type {OriginalWebObserverSigningContext} from '../../lib/ai/platform-web-deployment.cjs';
import type {provideOriginalPlatformWebHost} from '../../lib/ai/platform-web-host';
declare const original:OriginalNativePlatformWebHostConfiguration;
declare const options:NativePlatformBindingsOptions;
declare const identity:NativePlatformObserverIdentityOptions;
declare const context:OriginalWebObserverSigningContext;
const binding=createNativePlatformBindings({...options,observerIdentity:identity});
const signature:Promise<string>|undefined=binding.observerSigning?.sign(context);
void signature;
registerOriginalNativePlatformWebHostConfiguration({...original,nativeObserverIdentity:identity},{prepareTimeoutMs:1000,stopTimeoutMs:100});
type HostFactory=Parameters<typeof provideOriginalPlatformWebHost>[0];
declare const factory:HostFactory;
void factory;
// @ts-expect-error JSON cannot supply original identity access authority.
createNativePlatformBindings({...options,observerIdentity:{...identity,authorizeIdentityAccess:'JSON'}});
// @ts-expect-error Callers cannot choose a secret variable name through identity metadata.
createNativePlatformBindings({...options,observerIdentity:{...identity,variableName:'ANTHROPIC_API_KEY'}});
