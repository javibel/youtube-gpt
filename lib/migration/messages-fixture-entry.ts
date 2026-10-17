import 'server-only';
type Transport=(url:string,settings:RequestInit)=>Promise<Response>;
const key=Symbol.for('ytubviral.migration.messages-transport.v1');
const shared=globalThis as typeof globalThis&{[key]?:Transport;__ytvRuntimeGuard?:boolean};
const check=()=>{if(process.env.YTV_MIGRATION_WEB_TEST!=='1'||shared.__ytvRuntimeGuard!==true||process.env.AUTH_URL!=='http://127.0.0.1:4300')throw Error('ISOLATION_BLOCKED: closed message fixture unavailable');};
// Only the database-identified guarded startup retains this callable once.
// This is a closed transport,not native authentication/generation/send authority.
export function installMessagesFixtureTransport(run:Transport){check();if(typeof run!=='function'||Object.hasOwn(shared,key))throw Error('Message fixture transport already issued');Object.defineProperty(shared,key,{value:run,writable:false,configurable:false});}
export function getMessagesFixtureTransport():Transport|undefined{if(process.env.YTV_MIGRATION_WEB_TEST!=='1')return;check();if(!shared[key])throw Error('Message fixture transport is not installed');return shared[key];}
