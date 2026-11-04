export declare function createObserverHttpHandlers(options:{getService:()=>unknown;requireAdmin:()=>Promise<unknown>}):(request:Request,action:'admin'|'claim'|'result')=>Promise<Response>;
