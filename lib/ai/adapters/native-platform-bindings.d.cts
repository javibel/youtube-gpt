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
 readonly credentialRefs:Readonly<Partial<NativePlatformCredentialRefs>>;
 readCredential(context:Readonly<NativePlatformCredentialContext>):Promise<string>;
 resolveAddress(context:Readonly<{hostname:string;signal:AbortSignal}>):Promise<string>;
 stop():Promise<Readonly<NativePlatformBindingStop>>;
}
/** Import is inert. Explicit creation captures only selected native API keys. */
export declare function createNativePlatformBindings(options:NativePlatformBindingsOptions & {providerIds?:never}):Readonly<NativePlatformBindings & {credentialRefs:Readonly<NativePlatformCredentialRefs>}>;
export declare function createNativePlatformBindings<ProviderId extends NativePlatformProviderId>(options:NativePlatformBindingsOptions & {providerIds:readonly ProviderId[]}):Readonly<NativePlatformBindings & {credentialRefs:Readonly<Pick<NativePlatformCredentialRefs,ProviderId>>}>;
export declare function createNativePlatformBindings(options:NativePlatformBindingsOptions):Readonly<NativePlatformBindings>;
