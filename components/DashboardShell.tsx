'use client';

import { type ReactNode } from 'react';
import Sidebar from './Sidebar';

interface Props {
  children: ReactNode;
}

export default function DashboardShell({ children }: Props) {
  return (
    <div className="yv-shell">
      <Sidebar />
      <main className="min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
