import type {RoleConnectionOwnerOptions} from '../../contracts/ai/v1/postgres-connections.cjs';
import type {OperationalWebOptions} from './operational-composition.cjs';
import type {NativeWebProviderOptions} from './adapters/native-provider-owner.cjs';
type RuntimeBase=Omit<OperationalWebOptions,'connections'|'databaseName'|'timeoutMs'|'image'>&{image?:import('./ideogram-shared-runtime.cjs').OriginalWebImageCapabilities};
export type OperationalWebDeploymentRuntime=
 | (RuntimeBase&{nativeProviders?:never})
 | (Omit<RuntimeBase,'adapters'|'checkCredential'|'checkModelAvailability'>&{nativeProviders:NativeWebProviderOptions;adapters?:never;checkCredential?:never;checkModelAvailability?:never});
export interface OperationalWebDeploymentOptions {
 database:Omit<RoleConnectionOwnerOptions,'surface'|'createPool'>;
 runtime:OperationalWebDeploymentRuntime;
}
export declare function createOperationalWebDeployment(options:OperationalWebDeploymentOptions):Readonly<{
 dependencies:import('./shared-runtime-bootstrap.cjs').SharedRuntimeDependencies;
 assertOpen():void;
 retire():Promise<Readonly<{drained:boolean;uncertain:boolean}>>;
 prepare(options?:{signal?:AbortSignal}):ReturnType<ReturnType<typeof import('./operational-composition.cjs').createOperationalWebComposition>['prepare']>;
 close():Promise<Readonly<{closed:boolean;poolCount:number}>>;
}>;
