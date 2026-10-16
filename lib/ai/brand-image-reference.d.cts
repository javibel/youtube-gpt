import type { OutputSchema } from '../../contracts/ai/v1/core.cjs';
export const schema: OutputSchema;
export function valid(value: unknown): value is {kind:'brand-image-reference-v1';url:string};
