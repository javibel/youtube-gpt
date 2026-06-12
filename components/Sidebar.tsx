'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useLang } from './LangProvider';

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
      { href: '/predictor', label: { es: 'Predictor', en: 'Predictor' }, iconName: 'diamond' },
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
    chart:  <><path d="M2.5 13.5h11M2.5 2.5v11" {...s} /><path d="M4 13Q8 12.5 10.5 10T13 2.5" {...s} /></>,
    spark:  <><path d="M5.5 10.5Q4 9.5 3.5 8 3 6 4 4.5 5 3 6.5 2.5 7.5 2 8.5 2.5 10 3 11 4.5q1 1.5.5 3.5Q11 9.5 9.5 10.5" {...s} /><path d="M5.5 10.5h4M6 12.5h3M6.5 14h2M7.5 7v1.5" {...s} /></>,
    trophy: <><path d="M5 3h6v3a3 3 0 11-6 0V3zM3 4h2M11 4h2M6.5 9.5h3M5.5 13.5h5M8 9.5v4" {...s} /></>,
    plus:   <><path d="M2 14L10 6M10 6l1-3.5L7.5 4" {...s} /><path d="M12 3l1.5-1M14 5.5h-1.5M12.5 7.5l-1-1M10 2.5V1" {...s} /></>,
    stack:  <><path d="M2.5 5L8 2.5 13.5 5 8 7.5 2.5 5zM2.5 8L8 10.5 13.5 8M2.5 11L8 13.5 13.5 11" {...s} /></>,
    cal:    <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" {...s} /><path d="M2.5 6.5h11M5 2v3M11 2v3" {...s} /></>,
    split:  <><path d="M3 4h3l4 8h3M3 12h3M10 4h3" {...s} /></>,
    search: <><circle cx="5.5" cy="5" r="3" {...s} /><path d="M8 7l5.5 5.5M11 11v2M12.5 11v1.5" {...s} /></>,
    trend:  <><path d="M2.5 11L6 7l3 3 4.5-5.5M10 4.5h3.5V8" {...s} /></>,
    user2:  <><path d="M3 13L13 3M5 13H3v-2" {...s} /><path d="M13 13L3 3M11 13h2v-2" {...s} /></>,
    target: <><circle cx="8" cy="8" r="5.5" {...s} /><circle cx="8" cy="8" r="2.5" {...s} /><path d="M13.5 2.5L8 8" {...s} /></>,
    edit:   <><circle cx="6" cy="7" r="2.5" {...s} /><path d="M6 4.5V3.5M6 10.5v-1M3.5 7H2.5M9.5 7h-1M4 5L3.5 4.5M8 5l.5-.5M4 9l-.5.5M8 9l.5.5" {...s} /><circle cx="12" cy="11" r="1.5" {...s} /><path d="M12 9.5v-.5M12 13v-.5M10.5 11H10M14 11h-.5M11 10l-.3-.3M13 10l.3-.3M11 12l-.3.3M13 12l.3.3" {...s} /></>,
    image:  <><rect x="2" y="3" width="12" height="10" rx="1.5" {...s} /><path d="M6.5 6v4l4-2-4-2z" {...s} /></>,
    wave:   <><g transform="rotate(45 8 8)"><circle cx="8" cy="2.5" r=".7" {...s} /><path d="M8 3v10M4 9.5Q4 13 8 13T12 9.5" {...s} /><path d="M5.5 7h5" {...s} /></g></>,
    users:  <><circle cx="6" cy="5.5" r="2" {...s} /><circle cx="11" cy="5.5" r="1.5" {...s} /><path d="M2.5 13c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5M10 9.5c1.5 0 3 1 3 3" {...s} /></>,
    money:  <><circle cx="8" cy="8" r="5.5" {...s} /><path d="M8 4.5v6M9.5 6H7.5a1.2 1.2 0 000 2.4h1a1.2 1.2 0 010 2.4H6.5" {...s} strokeWidth={1} /></>,
    doc:    <><path d="M4 2h5l3 3v9H4V2zM9 2v3h3M6 8h4M6 11h4" {...s} /></>,
    clock:  <><circle cx="8" cy="8" r="5.5" {...s} /><path d="M8 5v3l2 1.5" {...s} /></>,
    bolt:   <><path d="M8 2L4 8h4l-1 6 5-8H8l1-4z" {...s} /></>,
    diamond:<><circle cx="8" cy="6.5" r="4.5" {...s} /><path d="M5 12h6M4.5 14h7" {...s} /></>,
    user:   <><circle cx="8" cy="6" r="2.5" {...s} /><path d="M3 13.5c0-2.5 2-4.5 5-4.5s5 2 5 4.5" {...s} /></>,
    team:   <><circle cx="8" cy="4" r="2" {...s} /><circle cx="3.5" cy="6.5" r="1.5" {...s} /><circle cx="12.5" cy="6.5" r="1.5" {...s} /><path d="M5 13c0-1.5 1.5-3 3-3s3 1.5 3 3M1.5 13c0-1 .8-2 2-2M12.5 11c1.2 0 2 1 2 2" {...s} /></>,
    book:   <><path d="M2.5 3.5h4.5a1.5 1.5 0 011.5 1.5v8.5a1 1 0 00-1-1H2.5v-9zM13.5 3.5H9a1.5 1.5 0 00-1.5 1.5v8.5a1 1 0 011-1h5v-9z" {...s} /></>,
  };
  return <svg width="28" height="28" viewBox="0 0 16 16" aria-hidden="true">{icons[name] || null}</svg>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const lang = useLang();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number; plan: string } | null>(null);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/user/stats')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.stats) {
          setUsage({ used: data.stats.generationsThisMonth, limit: data.stats.limit, plan: data.stats.plan });
        }
      })
      .catch(() => {});
  }, [session?.user]);

  function isActive(href: string) {
    // Gana el match más específico: /generate no se marca activo en /generate/bulk (E1 #6)
    if (pathname === href) return true;
    if (!pathname.startsWith(href + '/')) return false;
    const hasMoreSpecific = SECTIONS.some(s =>
      s.items.some(i =>
        i.href !== href && i.href.startsWith(href + '/') &&
        (pathname === i.href || pathname.startsWith(i.href + '/'))
      )
    );
    return !hasMoreSpecific;
  }

  const userName = session?.user?.name || session?.user?.email?.split('@')[0] || 'User';
  const userInitial = userName.charAt(0).toUpperCase();

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="yv-sidebar__brand">
        <a href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 3, textDecoration: 'none' }}>
          <svg width="14" height="14" viewBox="7 7 18 18" fill="none" aria-hidden="true">
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
                  aria-current={active ? 'page' : undefined}
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

      {/* Footer — usage + user + sign out */}
      <div className="yv-sidebar__footer">
        {usage && (
          <div style={{ padding: '0 12px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--yv-text-3)', fontFamily: 'var(--font-mono-jb)' }}>
                {usage.used}/{usage.limit} {t('generaciones', 'generations')}
              </span>
              {usage.plan === 'free' && (
                <a href="/pricing" style={{ fontSize: 11, color: 'var(--yv-brand)', fontFamily: 'var(--font-mono-jb)', textDecoration: 'none' }}>
                  {t('Mejorar', 'Upgrade')}
                </a>
              )}
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--yv-border, rgba(255,255,255,0.08))' }}>
              <div style={{
                height: '100%',
                borderRadius: 2,
                width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`,
                background: usage.used >= usage.limit ? '#ef4444' : usage.used >= usage.limit * 0.8 ? '#f59e0b' : 'var(--yv-brand)',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>
        )}
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

    </>
  );
}
