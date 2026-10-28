import type {PlatformWebDeploymentOptions} from './platform-web-deployment.cjs';
import type {NativePlatformBindingsOptions,NativePlatformBindings} from './adapters/native-platform-bindings.cjs';
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
