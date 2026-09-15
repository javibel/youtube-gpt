export function createRetryOperation(newKey: () => string): <T>(payload: unknown, send: (body: string, operationKey: string) => Promise<T>) => Promise<T>;
