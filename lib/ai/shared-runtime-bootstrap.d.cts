import type { AdministrativeConfigurationDependencies, AdministrativeConfigurationReadiness } from './configuration-runtime-bootstrap.cjs';
import type { OpenAIRuntimeDependencies } from './openai-runtime-bootstrap.cjs';
import type { Provider } from '../../contracts/ai/v1/core.cjs';
import type { TaskIdentity, MessagesTask } from './task-runtime';
import type { OperatingBudgetPolicy } from '../../contracts/ai/v1/operating-budget.cjs';
export interface SharedRuntimeDependencies extends Omit<AdministrativeConfigurationDependencies, 'registry' | 'storageIdentity'> {
 /** Original agent observers for full-catalog administration only; never web execution. */
 administrativeAgentReadiness?:Readonly<Pick<AdministrativeConfigurationDependencies,'checkCredential'|'checkModelAvailability'>>;
 adapters: Provider[];
 catalogAdapters?: Pick<Provider,'providerId'|'adapterVersion'|'enabled'|'credentialRef'|'models'>[];
 executorDatabase: OpenAIRuntimeDependencies['database'];
 storageIdentity: AdministrativeConfigurationDependencies['storageIdentity'] & {executorRole:string};
 policies: OpenAIRuntimeDependencies['policies'];
 budgetBindings: Record<string,string[]>;
 operatingBudget?: OperatingBudgetPolicy;
 authorize: OpenAIRuntimeDependencies['authorize'];
}
export interface SharedRuntimeReadiness extends AdministrativeConfigurationReadiness {
 executorRole:string; budgetIds:readonly string[]; providerIds:readonly string[];
 modelMetadata:readonly import('./model-metadata-readiness.cjs').ModelMetadataObservation[];
 operatingBudget?: Readonly<OperatingBudgetPolicy & {taskTypes:readonly string[];guardsVerified:true;nativeMonth:string}>;
}
export declare function createSharedRuntimeBootstrap(options:SharedRuntimeDependencies):Readonly<{
 prepare(options?:{signal?:AbortSignal}):Promise<Readonly<{
  factory:(identity:TaskIdentity)=>Promise<MessagesTask>;
  configurationDependencies:Omit<import('./configuration-service.cjs').ConfigurationDependencies,'getActor'>;
  readiness:Readonly<SharedRuntimeReadiness>;
 }>>;
}>;
