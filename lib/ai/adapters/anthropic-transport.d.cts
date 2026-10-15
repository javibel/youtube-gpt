import type { Provider } from '../../../contracts/ai/v1/core.cjs';
export interface AnthropicTransportDependencies {
 readCredential:(context:{credentialRef:string;signal:AbortSignal})=>Promise<string>;
 credentialRef:string;
 apiVersion:string;
 workspaceId?:string;
 maxRequestBytes:number;
 maxResponseBytes:number;
 models:Provider['models'];
 preflight:(context:unknown)=>Promise<{upperBoundMicros:number;currency:string;priceVersion:string}>;
 priceUsage:(context:unknown)=>Promise<{costMicros:number;currency:string;priceVersion:string;estimated:boolean}|null>;
}
export declare function createAnthropicHttpAdapter(options:AnthropicTransportDependencies & {fetch:(url:string,options:RequestInit)=>Promise<Response>}):Provider;
export declare function createAnthropicHttpsAdapter(options:AnthropicTransportDependencies & {resolveAddress:(context:{hostname:string;signal:AbortSignal})=>Promise<string>}):Provider;
