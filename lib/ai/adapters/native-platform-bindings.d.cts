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
export interface NativePlatformBindings {
 readonly credentialRefs:Readonly<{anthropic:'env:ANTHROPIC_API_KEY';openai:'env:OPENAI_API_KEY'}>;
 readCredential(context:Readonly<NativePlatformCredentialContext>):Promise<string>;
 resolveAddress(context:Readonly<{hostname:string;signal:AbortSignal}>):Promise<string>;
 stop():Promise<Readonly<NativePlatformBindingStop>>;
}
/** Import is inert. Explicit creation captures exactly the two native API keys. */
export declare function createNativePlatformBindings(options:NativePlatformBindingsOptions):Readonly<NativePlatformBindings>;
