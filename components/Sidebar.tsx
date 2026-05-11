'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface NavItem {
  href: string;
  label: { es: string; en: string };
  iconName: string;
  badge?: string;
}

interface NavSection {
  title: { es: string; en: string };
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: { es: 'Principal', en: 'Main' },
    items: [
      { href: '/dashboard', label: { es: 'Dashboard', en: 'Dashboard' }, iconName: 'grid' },
      { href: '/analytics', label: { es: 'Analytics', en: 'Analytics' }, iconName: 'chart' },
      { href: '/coach', label: { es: 'AI Coach', en: 'AI Coach' }, iconName: 'spark', badge: 'PRO' },
      { href: '/achievements', label: { es: 'Logros', en: 'Achievements' }, iconName: 'trophy' },
    ],
  },
  {
    title: { es: 'Crear', en: 'Create' },
    items: [
      { href: '/generate', label: { es: 'Generar', en: 'Generate' }, iconName: 'plus' },
      { href: '/generate/bulk', label: { es: 'Bulk', en: 'Bulk' }, iconName: 'stack' },
      { href: '/calendar', label: { es: 'Calendario', en: 'Calendar' }, iconName: 'cal' },
      { href: '/ab-test', label: { es: 'A/B Test', en: 'A/B Test' }, iconName: 'split' },
    ],
  },
  {
    title: { es: 'Investigar', en: 'Research' },
    items: [
      { href: '/research', label: { es: 'Keywords', en: 'Keywords' }, iconName: 'search' },
      { href: '/trends', label: { es: 'Tendencias', en: 'Trends' }, iconName: 'trend' },
      { href: '/competitors', label: { es: 'Competidores', en: 'Competitors' }, iconName: 'user2' },
    ],
  },
  {
    title: { es: 'Optimizar', en: 'Optimize' },
    items: [
      { href: '/seo-score', label: { es: 'SEO Score', en: 'SEO Score' }, iconName: 'target' },
      { href: '/optimize', label: { es: 'Optimizar', en: 'Optimize' }, iconName: 'edit' },
      { href: '/thumbnail-preview', label: { es: 'Thumbnails', en: 'Thumbnails' }, iconName: 'image' },
      { href: '/retention', label: { es: 'Retención', en: 'Retention' }, iconName: 'wave' },
    ],
  },
  {
    title: { es: 'Canal', en: 'Channel' },
    items: [
      { href: '/subscribers', label: { es: 'Suscriptores', en: 'Subscribers' }, iconName: 'users' },
      { href: '/revenue', label: { es: 'Ingresos', en: 'Revenue' }, iconName: 'money' },
      { href: '/audit', label: { es: 'Auditoría', en: 'Audit' }, iconName: 'doc' },
      { href: '/best-time', label: { es: 'Mejor hora', en: 'Best Time' }, iconName: 'clock' },
      { href: '/predictor', label: { es: 'Predictor', en: 'Predictor' }, iconName: 'bolt' },
    ],
  },
  {
    title: { es: 'Cuenta', en: 'Account' },
    items: [
      { href: '/profile', label: { es: 'Perfil', en: 'Profile' }, iconName: 'user' },
      { href: '/team', label: { es: 'Equipo', en: 'Team' }, iconName: 'team' },
      { href: '/learn', label: { es: 'Aprender', en: 'Learn' }, iconName: 'book' },
    ],
  },
];

// 16x16 stroke icons — consistent with design system
function YvIcon({ name }: { name: string }) {
  const s = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const icons: Record<string, React.ReactNode> = {
    grid:   <><rect x="2.5" y="2.5" width="5" height="5" rx="1" {...s} /><rect x="8.5" y="2.5" width="5" height="5" rx="1" {...s} /><rect x="2.5" y="8.5" width="5" height="5" rx="1" {...s} /><rect x="8.5" y="8.5" width="5" height="5" rx="1" {...s} /></>,
    chart:  <><path d="M2.5 13.5h11M4 11V7M7 11V4M10 11V8M13 11V5" {...s} /></>,
    spark:  <><path d="M8 2l1.5 4L13.5 8 9.5 9.5 8 14l-1.5-4.5L2.5 8 6.5 6 8 2z" {...s} /></>,
    trophy: <><path d="M5 3h6v3a3 3 0 11-6 0V3zM3 4h2M11 4h2M6.5 9.5h3M5.5 13.5h5M8 9.5v4" {...s} /></>,
    plus:   <><path d="M8 3v10M3 8h10" {...s} /></>,
    stack:  <><path d="M2.5 5L8 2.5 13.5 5 8 7.5 2.5 5zM2.5 8L8 10.5 13.5 8M2.5 11L8 13.5 13.5 11" {...s} /></>,
    cal:    <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" {...s} /><path d="M2.5 6.5h11M5 2v3M11 2v3" {...s} /></>,
    split:  <><path d="M3 4h3l4 8h3M3 12h3M10 4h3" {...s} /></>,
    search: <><circle cx="7" cy="7" r="4" {...s} /><path d="M10 10l3 3" {...s} /></>,
    trend:  <><path d="M2.5 11L6 7l3 3 4.5-5.5M10 4.5h3.5V8" {...s} /></>,
    user2:  <><circle cx="6" cy="5.5" r="2" {...s} /><path d="M2.5 13c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5M11 4.5a2 2 0 010 3M11 9.5c1.5.3 2.5 1.5 2.5 3" {...s} /></>,
    target: <><circle cx="8" cy="8" r="5.5" {...s} /><circle cx="8" cy="8" r="2.5" {...s} /></>,
    edit:   <><path d="M3 13l1-3 7-7 2 2-7 7-3 1zM10 4l2 2" {...s} /></>,
    image:  <><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" {...s} /><circle cx="6" cy="6" r="1" {...s} /><path d="M3 12l3-3 3 3 2-2 2 2" {...s} /></>,
    wave:   <><path d="M2 8c1-2 2-2 3 0s2 2 3 0 2-2 3 0 2 2 3 0" {...s} /></>,
    users:  <><circle cx="6" cy="5.5" r="2" {...s} /><circle cx="11" cy="5.5" r="1.5" {...s} /><path d="M2.5 13c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5M10 9.5c1.5 0 3 1 3 3" {...s} /></>,
    money:  <><circle cx="8" cy="8" r="5.5" {...s} /><path d="M8 5v6M9.5 6.5H7.5a1.2 1.2 0 000 2.4h1a1.2 1.2 0 010 2.4H6.5" {...s} /></>,
    doc:    <><path d="M4 2h5l3 3v9H4V2zM9 2v3h3M6 8h4M6 11h4" {...s} /></>,
    clock:  <><circle cx="8" cy="8" r="5.5" {...s} /><path d="M8 5v3l2 1.5" {...s} /></>,
    bolt:   <><path d="M9 2L3.5 9.5h4L7 14l5.5-7.5h-4L9 2z" {...s} /></>,
    user:   <><circle cx="8" cy="6" r="2.5" {...s} /><path d="M3 13.5c0-2.5 2-4.5 5-4.5s5 2 5 4.5" {...s} /></>,
    team:   <><circle cx="5.5" cy="6" r="2" {...s} /><circle cx="10.5" cy="6" r="2" {...s} /><path d="M2 13c0-2 1.5-3.5 3.5-3.5S9 11 9 13M7 13c0-2 1.5-3.5 3.5-3.5S14 11 14 13" {...s} /></>,
    book:   <><path d="M2.5 3.5h4.5a1.5 1.5 0 011.5 1.5v8.5a1 1 0 00-1-1H2.5v-9zM13.5 3.5H9a1.5 1.5 0 00-1.5 1.5v8.5a1 1 0 011-1h5v-9z" {...s} /></>,
  };
  return <svg width="28" height="28" viewBox="0 0 16 16" aria-hidden="true">{icons[name] || null}</svg>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [lang] = useState<Lang>(() => getLangClient());
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  }

  const userName = session?.user?.name || session?.user?.email?.split('@')[0] || 'User';
  const userInitial = userName.charAt(0).toUpperCase();

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="yv-sidebar__brand">
        <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="8" fill="var(--yv-brand)"/>
          </svg>
          <span className="yv-sidebar__name">YTubViral<span style={{ color: 'var(--yv-brand)' }}>.</span></span>
        </a>
      </div>

      {/* Nav groups */}
      <div className="yv-sidebar__nav">
        {SECTIONS.map(section => (
          <div className="yv-sidebar__group" key={section.title.en}>
            <div className="yv-sidebar__group-label">{section.title[lang]}</div>
            {section.items.map(item => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`yv-sidebar__item${active ? ' yv-sidebar__item--active' : ''}`}
                >
                  <span className="yv-sidebar__icon"><YvIcon name={item.iconName} /></span>
                  <span>{item.label[lang]}</span>
                  {item.badge && <span className="yv-sidebar__badge">{item.badge}</span>}
                </a>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer — user + sign out */}
      <div className="yv-sidebar__footer">
        <div className="yv-sidebar__user">
          <div className="yv-sidebar__avatar">{userInitial}</div>
          <div className="yv-sidebar__user-info">
            <div className="yv-sidebar__user-name">{userName}</div>
            <div className="yv-sidebar__user-plan">{session?.user?.email || ''}</div>
          </div>
          <button
            className="yv-sidebar__signout"
            aria-label={t('Cerrar sesión', 'Sign out')}
            title={t('Cerrar sesión', 'Sign out')}
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 14H3.5a1 1 0 01-1-1V3a1 1 0 011-1H6"/>
              <path d="M10.5 11.5L14 8l-3.5-3.5"/>
              <path d="M14 8H6"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="yv-sidebar-mobile-toggle"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--yv-text-3)' }}>
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="yv-sidebar-overlay" onClick={() => setMobileOpen(false)}>
          <aside
            className="yv-sidebar yv-sidebar--mobile"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="yv-sidebar-close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="yv-sidebar yv-sidebar--desktop">
        {sidebarContent}
      </aside>

      <style jsx global>{`
        /* ─── Sidebar shell ─────────────────────────────── */
        .yv-sidebar {
          background: var(--yv-bg-1);
          border-right: 1px solid var(--yv-border-subtle);
          display: flex;
          flex-direction: column;
          padding: 16px 12px;
          gap: 8px;
          overflow-y: auto;
          width: var(--yv-sidebar-w);
        }
        .yv-sidebar--desktop {
          position: sticky;
          top: 0;
          height: 100vh;
          z-index: 40;
          display: none;
        }
        @media (min-width: 769px) {
          .yv-sidebar--desktop { display: flex; }
          .yv-sidebar-mobile-toggle { display: none !important; }
        }

        /* Brand */
        .yv-sidebar__brand {
          display: flex; align-items: center; gap: 10px;
          padding: 6px 8px 14px;
          border-bottom: 1px solid var(--yv-border-subtle);
          margin-bottom: 8px;
        }
        .yv-sidebar__name {
          font-family: var(--yv-font-display);
          font-size: 15px; font-weight: 700;
          color: var(--yv-text-1);
          letter-spacing: -0.02em;
        }

        /* Nav */
        .yv-sidebar__nav {
          flex: 1;
          overflow-y: auto;
        }
        .yv-sidebar__nav::-webkit-scrollbar { width: 3px; }
        .yv-sidebar__nav::-webkit-scrollbar-track { background: transparent; }
        .yv-sidebar__nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 3px; }

        .yv-sidebar__group {
          display: flex; flex-direction: column;
          gap: 1px;
          padding-top: 12px;
        }
        .yv-sidebar__group-label {
          font-family: var(--yv-font-mono);
          font-size: 11px;
          font-weight: 500;
          color: var(--yv-text-4);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 10px 8px;
        }
        .yv-sidebar__item {
          display: flex; align-items: center; gap: 10px;
          height: 36px; padding: 0 8px;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 450;
          color: var(--yv-text-3);
          cursor: pointer;
          transition: background 150ms cubic-bezier(0.2,0.7,0.3,1), color 150ms cubic-bezier(0.2,0.7,0.3,1);
          text-decoration: none;
        }
        .yv-sidebar__item:hover {
          background: var(--yv-bg-3);
          color: var(--yv-text-1);
        }
        .yv-sidebar__item--active {
          background: var(--yv-bg-3);
          color: var(--yv-text-1);
          font-weight: 500;
          box-shadow: inset 0 0 0 1px var(--yv-border);
        }
        .yv-sidebar__icon {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          color: var(--yv-text-4);
          flex-shrink: 0;
        }
        .yv-sidebar__item:hover .yv-sidebar__icon { color: var(--yv-text-2); }
        .yv-sidebar__item--active .yv-sidebar__icon { color: var(--yv-brand); }
        .yv-sidebar__badge {
          margin-left: auto;
          font-size: 10px; font-family: var(--yv-font-mono);
          background: var(--yv-bg-4);
          color: var(--yv-text-3);
          padding: 1px 6px;
          border-radius: 4px;
        }

        /* Footer */
        .yv-sidebar__footer {
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid var(--yv-border-subtle);
        }
        .yv-sidebar__user {
          display: flex; align-items: center; gap: 10px;
          padding: 8px;
          border-radius: 8px;
          cursor: default;
          transition: background 150ms;
        }
        .yv-sidebar__user:hover { background: var(--yv-bg-3); }
        .yv-sidebar__avatar {
          width: 26px; height: 26px;
          border-radius: 50%;
          background: var(--yv-brand);
          display: flex; align-items: center; justify-content: center;
          color: white; font-weight: 600; font-size: 12px;
          flex-shrink: 0;
        }
        .yv-sidebar__user-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
        .yv-sidebar__user-name { font-size: 13px; color: var(--yv-text-1); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .yv-sidebar__user-plan { font-size: 11px; color: var(--yv-text-4); font-family: var(--yv-font-mono); }
        .yv-sidebar__signout {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          background: transparent;
          border: 1px solid var(--yv-border-subtle);
          border-radius: 6px;
          color: var(--yv-text-4);
          cursor: pointer;
          transition: all 150ms;
          flex-shrink: 0;
        }
        .yv-sidebar__signout:hover {
          background: var(--yv-brand-soft);
          border-color: var(--yv-brand-border);
          color: var(--yv-brand);
        }

        /* Mobile toggle */
        .yv-sidebar-mobile-toggle {
          position: fixed;
          top: 12px; left: 12px;
          z-index: 60;
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px;
          border-radius: 8px;
          border: 1px solid var(--yv-border);
          background: rgba(10,10,10,0.9);
          cursor: pointer;
          transition: border-color 150ms;
        }
        .yv-sidebar-mobile-toggle:hover { border-color: var(--yv-border-strong); }

        /* Mobile overlay */
        .yv-sidebar-overlay {
          position: fixed;
          inset: 0;
          z-index: 70;
          background: rgba(0,0,0,0.6);
        }
        .yv-sidebar--mobile {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 260px;
        }
        .yv-sidebar-close {
          position: absolute;
          top: 12px; right: 12px;
          background: none; border: none;
          color: var(--yv-text-4);
          cursor: pointer;
          transition: color 150ms;
        }
        .yv-sidebar-close:hover { color: var(--yv-text-1); }

        @media (max-width: 768px) {
          .yv-sidebar--desktop { display: none !important; }
        }
      `}</style>
    </>
  );
}
