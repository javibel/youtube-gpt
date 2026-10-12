export interface FixtureDrainReceipt {
  readonly status: 'drained' | 'failed';
  readonly workSettled: number;
  readonly originalsSettled: number;
  readonly rejectedWork: number;
  readonly rejectedOriginals: number;
  readonly resourcesClosed: number;
  readonly errors: readonly string[];
  readonly businessRecovery: false;
}
export interface FixtureLifecycle {
  check(): void;
  runWork<T>(start: () => PromiseLike<T>): Promise<T>;
  runOriginal<T extends { original: Promise<unknown> }>(start: () => T): T;
  openResource<T extends { close: () => Promise<void> }>(open: () => Promise<T>): Promise<T>;
  closeResource(resource: { close: () => Promise<void> }): Promise<void>;
  stop(): Promise<FixtureDrainReceipt>;
}
export declare function createFixtureLifecycle(options?: { beforeDrain?: () => void | Promise<void>; afterDrain?: () => void | Promise<void> }): FixtureLifecycle;
export declare function installFixtureLifecycle(lifecycle: FixtureLifecycle): void;
export declare function getFixtureLifecycle(): FixtureLifecycle;
