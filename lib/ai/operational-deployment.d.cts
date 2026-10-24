import type {RoleConnectionOwnerOptions} from '../../contracts/ai/v1/postgres-connections.cjs';
import type {OperationalWebOptions} from './operational-composition.cjs';
export interface OperationalWebDeploymentOptions {
 database:Omit<RoleConnectionOwnerOptions,'surface'|'createPool'>;
 runtime:Omit<OperationalWebOptions,'connections'|'databaseName'|'timeoutMs'>;
}
export declare function createOperationalWebDeployment(options:OperationalWebDeploymentOptions):Readonly<{
 dependencies:import('./shared-runtime-bootstrap.cjs').SharedRuntimeDependencies;
 assertOpen():void;
 prepare(options?:{signal?:AbortSignal}):ReturnType<ReturnType<typeof import('./operational-composition.cjs').createOperationalWebComposition>['prepare']>;
 close():Promise<Readonly<{closed:boolean;poolCount:number}>>;
}>;
