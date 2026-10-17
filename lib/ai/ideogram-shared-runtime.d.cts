import type { SharedRuntimeDependencies } from './shared-runtime-bootstrap.cjs';
import type { Provider } from '../../contracts/ai/v1/core.cjs';
export interface IdeogramSharedRuntimeDependencies extends SharedRuntimeDependencies {
 image: {
  models: Provider['models'];
  credentialRef: string;
  transport: {create(payload:Record<string,string>,options:{signal?:AbortSignal;timeout:number;maxRetries:0}):Promise<{kind:'brand-image-reference-v1';url:string}>};
  pricing: {currency:string;version:string};
  preflight(context:unknown):Promise<{upperBoundMicros:number;currency:string;priceVersion:string}>;
  priceUsage(context:unknown):Promise<{costMicros:number;currency:string;priceVersion:string;estimated:boolean}|null>;
 };
}
export declare function createIdeogramSharedRuntimeDependencies(options:IdeogramSharedRuntimeDependencies):Readonly<SharedRuntimeDependencies>;
