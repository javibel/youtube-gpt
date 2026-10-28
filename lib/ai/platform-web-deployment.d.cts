import type {OperationalWebDeploymentOptions,createOperationalWebDeployment} from './operational-deployment.cjs';
export interface PlatformWebDeploymentOptions {
 database:Omit<OperationalWebDeploymentOptions['database'],'getPassword'>;
 runtime:OperationalWebDeploymentOptions['runtime'];
 authorizeRoleAccess(request:Readonly<{kind:'prepare-platform-web-deployment'|'read-platform-role-password';surface:'web';host:string;port:number;databaseName:string;roles?:readonly string[];role?:string;user?:string;signal:AbortSignal}>):Promise<boolean>|boolean;
 sealAndDrainIngress(request:{signal:AbortSignal}):Promise<{drained:boolean}>|{drained:boolean};
 prepareTimeoutMs:number;
 stopTimeoutMs:number;
}
export declare function createPlatformWebDeployment(options:PlatformWebDeploymentOptions):ReturnType<typeof createOperationalWebDeployment>;
