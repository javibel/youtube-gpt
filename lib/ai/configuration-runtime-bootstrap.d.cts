import type { ConfigurationDependencies } from './configuration-service.cjs';
export interface AdministrativeConfigurationDependencies {
 registry: ConfigurationDependencies['registry'];
 readerDatabase: {role:'reader';transaction<T>(fn:(tx:{query(sql:string,args?:unknown[]):Promise<Record<string,unknown>[]>})=>Promise<T>):Promise<T>};
 activatorDatabase: {role:'activator';transaction<T>(fn:(tx:{query(sql:string,args?:unknown[]):Promise<Record<string,unknown>[]>})=>Promise<T>):Promise<T>};
 storageIdentity: {databaseName:string;readerRole:string;activatorRole:string};
 taskCatalog: ConfigurationDependencies['taskCatalog'];
 getRuntimes: ConfigurationDependencies['getRuntimes'];
 checkCredential: (context:{runtimeId:string;credentialRef:string;providerId:string;signal?:AbortSignal})=>Promise<boolean>;
 timeoutMs: number;
}
export interface AdministrativeConfigurationReadiness {
 configRevision:string; activeProfile:string; contractVersion:string;
 taskTypes:readonly string[]; storage:Readonly<{database:string;address:string;port:number}>;
 assignments:readonly unknown[];
}
export declare function createConfigurationRuntimeBootstrap(options:AdministrativeConfigurationDependencies):Readonly<{
 prepare(options?:{signal?:AbortSignal}):Promise<Readonly<{dependencies:Omit<ConfigurationDependencies,'getActor'>;readiness:Readonly<AdministrativeConfigurationReadiness>}>>;
}>;
