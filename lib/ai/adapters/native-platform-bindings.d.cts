import type {OriginalWebObserverSigningCapability} from '../platform-web-deployment.cjs';
export interface NativePlatformObserverIdentityGrant {
 readonly kind:'use-native-platform-observer-identity';readonly phase:'read-private-key'|'sign-request';
 readonly binding:'env:YTV_AI_OBSERVER_SIGNING_PRIVATE_KEY';readonly purpose:'agent-readiness-observation';
 readonly identity:Readonly<{peerId:string;keyId:string;spkiSha256:string}>;
 readonly requestId:string;readonly nonce:string;readonly configurationRevision:string;readonly configurationDigest:string;
 readonly signingTextDigest:string;readonly signingTextBytes:number;readonly signal:AbortSignal;
}
export interface NativePlatformObserverIdentityOptions {
 policy:OriginalWebObserverSigningCapability['policy'];
 identity:OriginalWebObserverSigningCapability['identity'];
 clock:OriginalWebObserverSigningCapability['clock'];
 authorizeSigning:OriginalWebObserverSigningCapability['authorizeSigning'];
 authorizeIdentityAccess(context:Readonly<NativePlatformObserverIdentityGrant>):boolean|Promise<boolean>;
}
export type NativePlatformProviderId='anthropic'|'openai';
export interface NativePlatformCredentialContext {
 readonly runtimeId:'web';
 readonly providerId:NativePlatformProviderId;
 readonly credentialRef:string;
 readonly signal:AbortSignal;
}
export interface NativePlatformCredentialGrant extends NativePlatformCredentialContext {
 readonly kind:'read-native-platform-provider-credential';
}
export interface NativePlatformBindingsOptions {
 authorizeCredentialAccess(context:Readonly<NativePlatformCredentialGrant>):Promise<boolean>|boolean;
 stopTimeoutMs:number;
 /** Explicit selection only; omission preserves both original providers. */
 providerIds?:readonly NativePlatformProviderId[];
 /** Optional original observation identity;the private env value isread only after a separate live grant. */
 observerIdentity?:NativePlatformObserverIdentityOptions;
}
export interface NativePlatformBindingStop {
 readonly drained:boolean;
 readonly uncertain:boolean;
 readonly closed:boolean;
 readonly pending:number;
 readonly credentialPending:number;
 readonly dnsPending:number;
 /** Only private captured references are cleared; process.env is unchanged. */
 readonly capturedSecretsCleared:true;
 readonly accepting:false;
 readonly restartAllowed:false;
}
export interface NativePlatformCredentialRefs {
 readonly anthropic:'env:ANTHROPIC_API_KEY';
 readonly openai:'env:OPENAI_API_KEY';
}
export interface NativePlatformBindings {
 readonly observerSigning?:Readonly<Omit<OriginalWebObserverSigningCapability,'sign'|'stop'>&{
  sign(context:Parameters<OriginalWebObserverSigningCapability['sign']>[0]):Promise<string>;
  stop():Promise<Readonly<NativePlatformBindingStop>>;
 }>;
 readonly credentialRefs:Readonly<Partial<NativePlatformCredentialRefs>>;
 readCredential(context:Readonly<NativePlatformCredentialContext>):Promise<string>;
 resolveAddress(context:Readonly<{hostname:string;signal:AbortSignal}>):Promise<string>;
 stop():Promise<Readonly<NativePlatformBindingStop>>;
}
/** Import is inert. Explicit creation captures only selected native API keys. */
export declare function createNativePlatformBindings(options:NativePlatformBindingsOptions & {providerIds?:never}):Readonly<NativePlatformBindings & {credentialRefs:Readonly<NativePlatformCredentialRefs>}>;
export declare function createNativePlatformBindings<ProviderId extends NativePlatformProviderId>(options:NativePlatformBindingsOptions & {providerIds:readonly ProviderId[]}):Readonly<NativePlatformBindings & {credentialRefs:Readonly<Pick<NativePlatformCredentialRefs,ProviderId>>}>;
export declare function createNativePlatformBindings(options:NativePlatformBindingsOptions):Readonly<NativePlatformBindings>;
