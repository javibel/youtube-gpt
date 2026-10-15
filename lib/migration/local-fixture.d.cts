import type { Registry, Configuration } from '../../contracts/ai/v1/core.cjs';
import type { SharedRuntimeDependencies } from '../ai/shared-runtime-bootstrap.cjs';
export declare const fixture: Readonly<{ userId: string; email: string; password: string; budgetId: string; taskType: string }>;
export declare function createFixtureRegistry(): Registry;
export declare function initialConfiguration(): Configuration;
export declare function connectLocalFixture(options?: { seed?: boolean }): Promise<{
  runtimeDependencies: SharedRuntimeDependencies;
  close: () => Promise<void>;
}>;
