import { notFound } from 'next/navigation';
import { AFFILIATES_DORMANT } from '@/lib/features';
import AffiliateDashboardClient from './AffiliateDashboardClient';

export default function AffiliateDashboardPage() {
  if (AFFILIATES_DORMANT) notFound();
  return <AffiliateDashboardClient />;
}
