import type {OperationalWebDeploymentOptions,createOperationalWebDeployment} from './operational-deployment.cjs';
import type {ObserverEnvelopePolicy,ObserverRequestData,FrozenObserverData} from '../../contracts/ai/v1/observer-channel.cjs';
export interface OriginalWebObserverSigningContext {
 readonly kind:'sign-original-observer-request-v1';readonly purpose:'agent-readiness-observation';
 readonly identity:Readonly<{peerId:string;keyId:string;spkiSha256:string}>;
 readonly request:FrozenObserverData<ObserverRequestData>;readonly signingText:string;readonly signal:AbortSignal;
}
/** Original native host capability only.No key loading,creation or enrollment. */
export interface OriginalWebObserverSigningCapability {
 policy:ObserverEnvelopePolicy;
 identity:{peerId:string;keyId:string;spkiSha256:string};
 clock():Date;
 authorizeSigning(context:Readonly<OriginalWebObserverSigningContext>):boolean|Promise<boolean>;
 sign(context:Readonly<OriginalWebObserverSigningContext>):string|Promise<string>;
 stop():Readonly<{drained:boolean;uncertain?:boolean}>|Promise<Readonly<{drained:boolean;uncertain?:boolean}>>;
}
export interface PlatformWebDeploymentOptions {
 database:Omit<OperationalWebDeploymentOptions['database'],'getPassword'>;
 runtime:OperationalWebDeploymentOptions['runtime'];
 authorizeRoleAccess(request:Readonly<{kind:'prepare-platform-web-deployment'|'read-platform-role-password';surface:'web';host:string;port:number;databaseName:string;roles?:readonly string[];role?:string;user?:string;signal:AbortSignal}>):Promise<boolean>|boolean;
 sealAndDrainIngress(request:{signal:AbortSignal}):Promise<{drained:boolean}>|{drained:boolean};
 prepareTimeoutMs:number;
 stopTimeoutMs:number;
 observerSigning?:OriginalWebObserverSigningCapability;
}
export declare function createPlatformWebDeployment(options:PlatformWebDeploymentOptions):ReturnType<typeof createOperationalWebDeployment>&Readonly<{
 bindObserverChannel(input:Readonly<{policy:unknown;pins:unknown;clock:()=>Date;verifyAgentOriginal:(context:unknown)=>Promise<boolean>}>):unknown;
 signObserverRequest(request:ObserverRequestData,invocation?:{signal?:AbortSignal}):Promise<Readonly<{scope:'signature-only-no-authority';trust:'untrusted-observer-data';identity:Readonly<{peerId:string;keyId:string;spkiSha256:string}>;wire:string}>>;
}>;
