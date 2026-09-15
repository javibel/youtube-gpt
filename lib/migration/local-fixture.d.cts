import type { Registry, Configuration } from '../../contracts/ai/v1/core.cjs';
import type { TaskIdentity, MessagesTask } from '../ai/task-runtime';
import type { ConfigurationDependencies } from '../ai/configuration-service.cjs';
export declare const fixture: Readonly<{ userId: string; email: string; password: string; budgetId: string; taskType: string }>;
export declare function createFixtureRegistry(): Registry;
export declare function initialConfiguration(): Configuration;
export declare function connectLocalFixture(options?: { seed?: boolean }): Promise<{
  taskFactory: (identity: TaskIdentity) => Promise<MessagesTask>;
  configurationDependencies: Omit<ConfigurationDependencies, 'getActor'>;
  close: () => Promise<void>;
}>;
