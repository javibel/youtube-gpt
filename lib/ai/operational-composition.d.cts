import type {SharedRuntimeDependencies,SharedRuntimeReadiness} from './shared-runtime-bootstrap.cjs';
import type {OperationalPostgresOptions} from '../../contracts/ai/v1/postgres-storage.cjs';
export interface OperationalWebOptions extends Omit<SharedRuntimeDependencies,'readerDatabase'|'activatorDatabase'|'executorDatabase'|'storageIdentity'> {
 connections:Record<'reader'|'activator'|'executor',OperationalPostgresOptions['connect']>;
 databaseName:string;
 operatingBudget:NonNullable<SharedRuntimeDependencies['operatingBudget']>;
}
export declare function createOperationalWebComposition(options:OperationalWebOptions):Readonly<{
 dependencies:SharedRuntimeDependencies;
 prepare(options?:{signal?:AbortSignal}):Promise<Readonly<{factory:unknown;configurationDependencies:unknown;readiness:Readonly<SharedRuntimeReadiness>}>>;
}>;
