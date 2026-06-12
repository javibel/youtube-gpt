'use client';

import { type ReactNode } from 'react';
import Sidebar from './Sidebar';

interface Props {
  children: ReactNode;
}

export default function DashboardShell({ children }: Props) {
  return (
    <div className="yv-shell">
      <a href="#main-content" className="yv-skip-link">Saltar al contenido · Skip to content</a>
      <Sidebar />
      <main id="main-content" className="min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
