import type {RoleBoundDatabase,Transaction} from './control-store.cjs';
export interface NativePostgresClient {
 query(sql:string,parameters?:unknown[]):Promise<{rows:Record<string,unknown>[]}>;
 release(destroy?:boolean):void;
 connection:{stream:{encrypted:boolean;authorized:boolean}};
}
export interface OperationalPostgresOptions {
 role:'reader'|'activator'|'executor';
 controlSchema:'ytv_ai_v1';
 databaseName:string;
 connect:(options:{signal?:AbortSignal})=>Promise<NativePostgresClient>;
 timeoutMs:number;
}
/** Same native worker; settlement is not commit authority or stream/pool close. */
export interface OriginalPostgresTransaction<T> {
 readonly result:Promise<T>;
 readonly settled:Promise<void>;
}
export declare function createPostgresControlDatabase(options:OperationalPostgresOptions):Readonly<RoleBoundDatabase & {
 controlSchema:'ytv_ai_v1';
 transaction<T>(work:(tx:Transaction)=>Promise<T>,options?:{signal?:AbortSignal}):Promise<T>;
 transactionOriginal<T>(work:(tx:Transaction)=>Promise<T>,options?:{signal?:AbortSignal}):Readonly<OriginalPostgresTransaction<T>>;
}>;
