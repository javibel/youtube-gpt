export declare const OBSERVER_ENVELOPE_VERSION:'ytv-observer-envelope-v1';
export declare const OBSERVER_ENVELOPE_PURPOSE:'agent-readiness-observation';
export interface ObserverPeerData {peerId:string;keyId:string}
export interface ObserverEnvelopePolicy {
 runtimeId:'agent';providerId:'anthropic';credentialRef:string;models:readonly string[];
 configurationRevision:string;configurationDigest:string;
 requester:ObserverPeerData;responder:ObserverPeerData;
}
export interface ObserverBindingData {
 version:typeof OBSERVER_ENVELOPE_VERSION;purpose:typeof OBSERVER_ENVELOPE_PURPOSE;
 requestId:string;nonce:string;configurationRevision:string;configurationDigest:string;
 runtimeId:'agent';providerId:'anthropic';credentialRef:string;
 requester:ObserverPeerData;responder:ObserverPeerData;issuedAt:number;deadline:number;
}
export type ObserverOperationData=(
 |{operation:'credential-availability-boolean';model:null}
 |{operation:'model-metadata-observation';model:string}
);
export type ObserverRequestData=ObserverBindingData & {kind:'request'} & ObserverOperationData;
/** Same ten fields as the bound metadata contract, carried only as untrusted claims. */
export interface ObserverMetadataData {
 runtimeId:string;providerId:string;credentialRef:string;requestedModel:string;resolvedModel:string;
 exactModelMatch:boolean;metadataAccessible:true;selectionUnchanged:true;generationVerified:false;budgetVerified:false;
}
export type ObserverResultData=ObserverBindingData & {kind:'result';observedAt:number} & (
 |{operation:'credential-availability-boolean';model:null;outcome:'observed';originalOperationState:'observation-returned';value:boolean}
 |{operation:'model-metadata-observation';model:string;outcome:'observed';originalOperationState:'observation-returned';value:ObserverMetadataData}
 |(ObserverOperationData & {outcome:'unconfirmed';originalOperationState:'unconfirmed';value:null})
 |(ObserverOperationData & {outcome:'declined';originalOperationState:'not-dispatched';value:null})
);
export type FrozenObserverData<T>=T extends object?{readonly[K in keyof T]:FrozenObserverData<T[K]>}:T;
export interface UntrustedObserverData<T> {
 readonly trust:'untrusted-observer-data';readonly kind:'request'|'result';
 readonly unsigned:FrozenObserverData<T>;readonly signature:string;readonly signingText:string;readonly wire:string;
}
/** Grammar/correlation only. No authentication, consent, native close or readiness capability. */
export declare function createObserverEnvelopeContract(policy:ObserverEnvelopePolicy):Readonly<{
 requestSigningText(value:ObserverRequestData):string;
 encodeRequest(value:ObserverRequestData,signature:string):string;
 parseRequest(wire:string):UntrustedObserverData<ObserverRequestData>;
 resultSigningText(value:ObserverResultData,originalRequestWire:string):string;
 encodeResult(value:ObserverResultData,signature:string,originalRequestWire:string):string;
 parseResult(wire:string,originalRequestWire:string):UntrustedObserverData<ObserverResultData>;
}>;
