import type {PlatformWebDeploymentOptions} from './platform-web-deployment.cjs';
import type {NativePlatformBindingsOptions,NativePlatformBindings} from './adapters/native-platform-bindings.cjs';
import type {NativeWebAnthropicConfiguration,NativeWebOpenAIConfiguration} from './adapters/native-provider-owner.cjs';
export type OriginalPlatformWebHostFactory=(context:Readonly<{
 signal:AbortSignal;
 createNativePlatformBindings:(options:NativePlatformBindingsOptions)=>Readonly<NativePlatformBindings>;
}>)=>PlatformWebDeploymentOptions|Promise<PlatformWebDeploymentOptions>;
export interface OriginalPlatformWebHostOptions {
 signal?:AbortSignal;
 prepareTimeoutMs:number;
 stopTimeoutMs:number;
}
export interface OriginalPlatformWebHostRegistration extends Readonly<OriginalPlatformWebHostOptions> {
 readonly factory:OriginalPlatformWebHostFactory;
}
/** Native import and registration never invoke the factory or read secrets. */
export declare function registerOriginalPlatformWebHostFactory(factory:OriginalPlatformWebHostFactory,options:OriginalPlatformWebHostOptions):void;
export declare function getOriginalPlatformWebHostFactory():Readonly<OriginalPlatformWebHostRegistration>|undefined;
/** Permanently seals registration, including a missing or preprovided path. */
export declare function beginOriginalPlatformWebHostPreparation():Readonly<OriginalPlatformWebHostRegistration>|undefined;
type NativeProviderSelection<T>=Omit<T,'credentialRef'|'readCredential'|'resolveAddress'>;
export type OriginalNativeWebProviderSelection={stopTimeoutMs:number}&(
 |{anthropic:NativeProviderSelection<NativeWebAnthropicConfiguration>;openai?:never}
 |{anthropic?:never;openai:NativeProviderSelection<NativeWebOpenAIConfiguration>}
 |{anthropic:NativeProviderSelection<NativeWebAnthropicConfiguration>;openai:NativeProviderSelection<NativeWebOpenAIConfiguration>}
);
export interface OriginalNativePlatformWebHostConfiguration {
 deployment:Omit<PlatformWebDeploymentOptions,'runtime'>&{
  runtime:Omit<PlatformWebDeploymentOptions['runtime'],'nativeProviders'|'adapters'|'checkCredential'|'checkModelAvailability'>;
 };
 providers:OriginalNativeWebProviderSelection;
 authorizeCredentialAccess:NativePlatformBindingsOptions['authorizeCredentialAccess'];
 bindingStopTimeoutMs:number;
}
/** Inert registration; host preparation creates and owns exactly the selected native bindings. */
export declare function registerOriginalNativePlatformWebHostConfiguration(configuration:OriginalNativePlatformWebHostConfiguration,options:OriginalPlatformWebHostOptions):void;
