import type { ControlSchema,RoleBoundDatabase } from '../../contracts/ai/v1/control-store.cjs';
import type { ConfigurationDependencies } from './configuration-service.cjs';
export interface AdministrativeConfigurationDependencies {
 registry: ConfigurationDependencies['registry'];
 readerDatabase: {role:'reader';controlSchema?:ControlSchema;transaction<T>(fn:(tx:{query(sql:string,args?:unknown[]):Promise<Record<string,unknown>[]>})=>Promise<T>):Promise<T>} & Pick<RoleBoundDatabase,'transactionOriginal'>;
 activatorDatabase: {role:'activator';controlSchema?:ControlSchema;transaction<T>(fn:(tx:{query(sql:string,args?:unknown[]):Promise<Record<string,unknown>[]>})=>Promise<T>):Promise<T>};
 storageIdentity: {controlSchema?:ControlSchema;databaseName:string;readerRole:string;activatorRole:string};
 taskCatalog: ConfigurationDependencies['taskCatalog'];
 getRuntimes: ConfigurationDependencies['getRuntimes'];
 checkCredential: (context:{runtimeId:string;credentialRef:string;providerId:string;signal?:AbortSignal})=>Promise<boolean>;
 checkModelAvailability: ConfigurationDependencies['checkModelAvailability'];
 isTaskFunded?:ConfigurationDependencies['isTaskFunded'];
 timeoutMs: number;
 /** Internal startup observation selector; never an HTTP configuration field. */
 observationRuntimeId?:string;
}
export interface AdministrativeConfigurationReadiness {
 configRevision:string; activeProfile:string; contractVersion:string;
 taskTypes:readonly string[]; storage:Readonly<{database:string;address:string;port:number}>;
 assignments:readonly unknown[];
 observationScope:Readonly<{kind:'all'|'runtime';runtimeId:string|null;observedRuntimeIds:readonly string[];unobservedRuntimeIds:readonly string[]}>;
}
export declare function createConfigurationRuntimeBootstrap(options:AdministrativeConfigurationDependencies):Readonly<{
 prepare(options?:{signal?:AbortSignal}):Promise<Readonly<{dependencies:Omit<ConfigurationDependencies,'getActor'>;readiness:Readonly<AdministrativeConfigurationReadiness>}>>;
}>;
