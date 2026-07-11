import { notFound } from 'next/navigation';
import { AFFILIATES_DORMANT } from '@/lib/features';
import AffiliatesTermsClient from './AffiliatesTermsClient';

export default function AffiliatesTermsPage() {
  if (AFFILIATES_DORMANT) notFound();
  return <AffiliatesTermsClient />;
}
