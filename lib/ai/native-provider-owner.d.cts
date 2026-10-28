import type {AiRequest,Provider,Snapshot,Usage} from '../../contracts/ai/v1/core.cjs';

export interface NativeWebCredentialContext {
 readonly runtimeId:'web';
 readonly providerId:'anthropic'|'openai';
 readonly credentialRef:string;
 readonly signal:AbortSignal;
}
export interface NativeWebPriceQuote {
 upperBoundMicros:number;
 currency:string;
 priceVersion:string;
}
export interface NativeWebProviderConfiguration {
 models:Provider['models'];
 credentialRef:string;
 readCredential(context:Readonly<NativeWebCredentialContext>):Promise<string>|string;
 resolveAddress(context:Readonly<{hostname:string;signal:AbortSignal}>):Promise<string>|string;
 preflight(context:Readonly<{payload:Record<string,unknown>;request:Readonly<AiRequest>;snapshot:Readonly<Snapshot>;signal:AbortSignal}>):Promise<NativeWebPriceQuote>|NativeWebPriceQuote;
 priceUsage(context:Readonly<{usage:Partial<Usage>;snapshot:Readonly<Snapshot>;quote:NativeWebPriceQuote;signal:AbortSignal}>):Promise<{costMicros:number;currency:string;priceVersion:string;estimated:boolean}|null>|{costMicros:number;currency:string;priceVersion:string;estimated:boolean}|null;
 credentialTimeoutMs:number;
 callTimeoutMs:number;
 maxRequestBytes:number;
 maxResponseBytes:number;
}
export interface NativeWebProviderOwnerOptions {
 anthropic:NativeWebProviderConfiguration & {apiVersion:string;workspaceId:string|null};
 // The public wire currently supports only explicit key-scoped account routing.
 openai:NativeWebProviderConfiguration & {organization:null;project:null};
 stopTimeoutMs:number;
}
export type NativeWebProviderOptions=NativeWebProviderOwnerOptions;
export interface NativeWebProviderStop {
 readonly drained:boolean;
 readonly uncertain:boolean;
 readonly pending:number;
 readonly active:number;
 readonly fetchesDrained:boolean;
 readonly accepting:false;
 readonly restartAllowed:false;
}
export declare function createNativeWebProviderOwner(options:NativeWebProviderOwnerOptions):Readonly<{
 adapters:readonly Readonly<Provider>[];
 checkCredential(context:Readonly<{runtimeId:'web';providerId:string;credentialRef:string;signal?:AbortSignal}>):Promise<boolean>;
 stop():Promise<Readonly<NativeWebProviderStop>>;
}>;
