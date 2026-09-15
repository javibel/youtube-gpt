import Link from 'next/link';
import DashboardShell from '@/components/DashboardShell';
import { requireAdmin } from '@/lib/auth-guards';
import ConfigurationPanel from './configuration-panel';

export default async function ConfigurationPage() {
  const gate = await requireAdmin();
  if (!gate.ok) return <p className="p-8">Necesitas acceso de administración para abrir esta página.</p>;
  return <DashboardShell><div className="mx-auto max-w-5xl p-6 space-y-6">
    <Link href="/admin" className="text-sm underline">Volver a administración</Link>
    <header><h1 className="text-2xl font-bold">Perfiles de inteligencia artificial</h1>
      <p className="mt-2" style={{ color: 'var(--text-dim)' }}>Revisa qué proveedor y modelo utiliza cada tarea antes de cambiar el perfil activo.</p></header>
    <ConfigurationPanel />
  </div></DashboardShell>;
}
