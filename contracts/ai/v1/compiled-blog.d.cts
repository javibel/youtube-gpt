export type PublicBlogBlock =
  | { type: 'p'; t: string }
  | { type: 'h2'; t: string }
  | { type: 'h3'; t: string }
  | { type: 'callout'; t: string }
  | { type: 'list'; items: string[] }
  | { type: 'callout-mid'; t: string; sub: string; cta: string; href?: string }
  | { type: 'callout-final'; t: string; sub: string; cta: string; href?: string }
  | { type: 'callout-gear'; t: string; sub: string; cta: string }
  | { type: 'video'; videoId: string };
export interface PublicBlogDelivery {
  version: 1;
  publicationId: string;
  payloadDigest: string;
  slug: string;
  lang: 'es' | 'en';
  cat: 'ai' | 'youtube' | 'marketing' | 'tutorials';
  readMin: number;
  publishedAt: string;
  author: { name: string; role: string; avatar: string };
  title: string;
  excerpt: string;
  blocks: PublicBlogBlock[];
  canonicalUrl: string;
}
export interface PublicBlogDocument { version: 1; deliveries: PublicBlogDelivery[] }
export function validatePublicBlogDelivery(value: unknown): PublicBlogDelivery;
export function validatePublicBlogDocument(value: unknown): PublicBlogDocument;
export function appendPublicBlogDelivery(document: unknown, delivery: unknown): PublicBlogDocument;
export function serializePublicBlogDelivery(delivery: unknown): string;
export function readPublicBlogMarker(html: string): PublicBlogDelivery;
