import type { AdministrativeConfigurationDependencies, AdministrativeConfigurationReadiness } from './configuration-runtime-bootstrap.cjs';
import type { OpenAIRuntimeDependencies } from './openai-runtime-bootstrap.cjs';
import type { Provider } from '../../contracts/ai/v1/core.cjs';
import type { TaskIdentity, MessagesTask } from './task-runtime';
export interface SharedRuntimeDependencies extends Omit<AdministrativeConfigurationDependencies, 'registry' | 'storageIdentity'> {
 adapters: Provider[];
 executorDatabase: OpenAIRuntimeDependencies['database'];
 storageIdentity: AdministrativeConfigurationDependencies['storageIdentity'] & {executorRole:string};
 policies: OpenAIRuntimeDependencies['policies'];
 budgetBindings: Record<string,string[]>;
 authorize: OpenAIRuntimeDependencies['authorize'];
}
export interface SharedRuntimeReadiness extends AdministrativeConfigurationReadiness {
 executorRole:string; budgetIds:readonly string[]; providerIds:readonly string[];
}
export declare function createSharedRuntimeBootstrap(options:SharedRuntimeDependencies):Readonly<{
 prepare(options?:{signal?:AbortSignal}):Promise<Readonly<{
  factory:(identity:TaskIdentity)=>Promise<MessagesTask>;
  configurationDependencies:Omit<import('./configuration-service.cjs').ConfigurationDependencies,'getActor'>;
  readiness:Readonly<SharedRuntimeReadiness>;
 }>>;
}>;
