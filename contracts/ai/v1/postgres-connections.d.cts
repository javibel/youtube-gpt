import type {OperationalPostgresOptions} from './postgres-storage.cjs';
export type OperationalRole='reader'|'activator'|'executor';
export interface RoleConnectionOwnerOptions {
 surface:'web'|'agent';host:string;port:number;databaseName:string;timeoutMs:number;maxConnections:number;
 getPassword(context:{surface:'web'|'agent';role:OperationalRole;user:string;signal:AbortSignal}):Promise<string>;
 createPool(options:{host:string;port:number;database:string;user:string;password:string;ssl:{rejectUnauthorized:true};max:number;connectionTimeoutMillis:number;idleTimeoutMillis:number;allowExitOnIdle:true}):{connect:OperationalPostgresOptions['connect'];end:()=>Promise<void>};
}
export declare function createRoleConnectionOwner(options:RoleConnectionOwnerOptions):Readonly<{
 prepare(options?:{signal?:AbortSignal}):Promise<Readonly<{databaseName:string;surface:'web'|'agent';connections:Partial<Record<OperationalRole,OperationalPostgresOptions['connect']>>}>>;
 close():Promise<Readonly<{closed:boolean;poolCount:number}>>;
}>;
