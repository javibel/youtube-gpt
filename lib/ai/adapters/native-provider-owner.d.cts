import type {AiRequest,Provider,Snapshot,Usage} from '../../../contracts/ai/v1/core.cjs';

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
 authorizeMetadataRead?(context:Readonly<NativeWebCredentialContext & {model:string;account:Readonly<Record<string,string|null>>}>):Promise<boolean>|boolean;
 resolveAddress(context:Readonly<{hostname:string;signal:AbortSignal}>):Promise<string>|string;
 preflight(context:Readonly<{payload:Record<string,unknown>;request:Readonly<AiRequest>;snapshot:Readonly<Snapshot>;signal:AbortSignal}>):Promise<NativeWebPriceQuote>|NativeWebPriceQuote;
 priceUsage(context:Readonly<{usage:Partial<Usage>;snapshot:Readonly<Snapshot>;quote:NativeWebPriceQuote;signal:AbortSignal}>):Promise<{costMicros:number;currency:string;priceVersion:string;estimated:boolean}|null>|{costMicros:number;currency:string;priceVersion:string;estimated:boolean}|null;
 credentialTimeoutMs:number;
 callTimeoutMs:number;
 maxRequestBytes:number;
 maxResponseBytes:number;
}
export interface NativeWebCountedReservationConfiguration {
 revision:'anthropic-web-text-count-and-haiku-vision-context-2026-11-13';
 pricingSelections:readonly Readonly<{tariffRevision:'anthropic-public-2026-10-28';model:string;mode:'standard-global-direct';cacheWriteTtl:'none'|'5m'|'1h'}>[];
 authorizeTokenCount(context:Readonly<NativeWebCredentialContext & {operation:'count-input-tokens';countingScope:'messages-and-system';model:string;payloadDigest:string;account:Readonly<{apiVersion:string;workspaceId:string|null}>}>):boolean|Promise<boolean>;
 authorizeCountedReservation(context:Readonly<NativeWebCredentialContext & {reservationRevision:string;reservationBasis:'counted-double-plus4096'|'haiku-vision-context-200000';taskType:string;model:string;payloadDigest:string;requestId:string;maxCostMicros:number;maxOutputTokens:number;maxToolCalls:number;account:Readonly<{apiVersion:string;workspaceId:string|null}>}>):boolean|Promise<boolean>;
}
export type NativeWebAnthropicConfiguration=Omit<NativeWebProviderConfiguration,'preflight'|'priceUsage'> & {apiVersion:string;workspaceId:string|null} & (
 | {preflight:NativeWebProviderConfiguration['preflight'];priceUsage:NativeWebProviderConfiguration['priceUsage'];requestReservation?:never}
 | {requestReservation:NativeWebCountedReservationConfiguration;preflight?:never;priceUsage?:never}
);
// The public wire currently supports only explicit key-scoped account routing.
export type NativeWebOpenAIConfiguration=NativeWebProviderConfiguration & {organization:null;project:null};
/** Explicitly provide one or both blocks; no provider is inferred or selected. */
export type NativeWebProviderOwnerOptions={stopTimeoutMs:number} & (
 | {anthropic:NativeWebAnthropicConfiguration;openai?:never}
 | {anthropic?:never;openai:NativeWebOpenAIConfiguration}
 | {anthropic:NativeWebAnthropicConfiguration;openai:NativeWebOpenAIConfiguration}
);
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
 checkModelAvailability(context:Readonly<{runtimeId:'web';providerId:string;credentialRef:string;model:string;signal?:AbortSignal}>):Promise<Readonly<import('../model-metadata-readiness.cjs').ModelMetadataObservation>>;
 stop():Promise<Readonly<NativeWebProviderStop>>;
}>;
export declare const WEB_RESERVATION_REVISION:'anthropic-web-text-count-and-haiku-vision-context-2026-11-13';
