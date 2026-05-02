'use client';

import { type ReactNode } from 'react';
import Sidebar from './Sidebar';

interface Props {
  children: ReactNode;
}

export default function DashboardShell({ children }: Props) {
  return (
    <div style={{ background: 'var(--yv-bg-0)', color: 'var(--yv-text-2)', minHeight: '100vh' }}>
      <Sidebar />
      {/* Content area — offset by sidebar width on desktop */}
      <div className="yv-shell-content">
        {children}
      </div>

      <style jsx global>{`
        .yv-shell-content {
          min-height: 100vh;
        }
        @media (min-width: 769px) {
          .yv-shell-content {
            margin-left: var(--yv-sidebar-w);
          }
        }
      `}</style>
    </div>
  );
}
