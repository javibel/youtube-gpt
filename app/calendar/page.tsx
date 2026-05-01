'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { getLangClient } from '@/lib/get-lang-client';

type Lang = 'es' | 'en';

interface Entry {
  id: string;
  title: string;
  description: string | null;
  date: string;
  status: string;
  color: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  idea: '#6366f1',
  draft: '#eab308',
  scheduled: '#3b82f6',
  published: '#22c55e',
};

const STATUS_LABELS: Record<string, Record<Lang, string>> = {
  idea: { es: 'Idea', en: 'Idea' },
  draft: { es: 'Borrador', en: 'Draft' },
  scheduled: { es: 'Programado', en: 'Scheduled' },
  published: { es: 'Publicado', en: 'Published' },
};

const MONTH_NAMES: Record<Lang, string[]> = {
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

const DAY_HEADERS: Record<Lang, string[]> = {
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const days: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    days.push(`${year}-${mm}-${dd}`);
  }
  return days;
}

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const [lang, setLang] = useState<Lang>('es');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  // Modal state
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: Entry; date?: string } | null>(null);
  const [form, setForm] = useState({ title: '', description: '', status: 'idea', date: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { setLang(getLangClient()); }, []);
  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const mm = String(month + 1).padStart(2, '0');
    const from = `${year}-${mm}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
    try {
      const res = await fetch(`/api/calendar?from=${from}&to=${to}`);
      const json = await res.json();
      if (res.ok) setEntries(json.entries || []);
      else if (json.error === 'pro_required') setError(t('Plan Pro requerido.', 'Pro plan required.'));
      else setError(json.error || 'Error');
    } catch {
      setError(t('Error de conexión', 'Connection error'));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    if (status === 'authenticated') fetchEntries();
  }, [status, fetchEntries]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  function openAdd(date: string) {
    setForm({ title: '', description: '', status: 'idea', date });
    setModal({ mode: 'add', date });
  }

  function openEdit(entry: Entry) {
    setForm({ title: entry.title, description: entry.description || '', status: entry.status, date: entry.date });
    setModal({ mode: 'edit', entry });
  }

  async function saveEntry() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (modal?.mode === 'add') {
        const res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        if (res.ok) { setModal(null); fetchEntries(); }
      } else if (modal?.mode === 'edit' && modal.entry) {
        const res = await fetch('/api/calendar', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: modal.entry.id, ...form }),
        });
        if (res.ok) { setModal(null); fetchEntries(); }
      }
    } catch { /* */ }
    setSaving(false);
  }

  async function deleteEntry() {
    if (!modal?.entry) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar?id=${modal.entry.id}`, { method: 'DELETE' });
      if (res.ok) { setModal(null); fetchEntries(); }
    } catch { /* */ }
    setSaving(false);
  }

  async function cycleStatus(entry: Entry) {
    const order = ['idea', 'draft', 'scheduled', 'published'];
    const nextIdx = (order.indexOf(entry.status) + 1) % order.length;
    const newStatus = order[nextIdx];
    try {
      const res = await fetch('/api/calendar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, status: newStatus }),
      });
      if (res.ok) fetchEntries();
    } catch { /* */ }
  }

  const days = getMonthDays(year, month);
  const today = new Date().toISOString().slice(0, 10);

  if (status === 'loading') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen grain flex items-center justify-center" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
        <div className="text-center">
          <h1 className="font-display font-bold text-3xl text-white mb-4">{t('Calendario', 'Calendar')}</h1>
          <p className="text-zinc-500 mb-6 font-mono-jb text-sm">{t('Inicia sesión para planificar tu contenido.', 'Sign in to plan your content.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grain" style={{ background: 'var(--ink)', color: 'var(--text)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 backdrop-blur-md" style={{ background: 'rgba(10,10,10,0.85)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/dashboard" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="13" stroke="#9B2020" strokeWidth="2.2"/>
              <polygon points="13,10.5 13,21.5 23,16" fill="#9B2020"/>
            </svg>
            <span className="font-display font-bold text-[16px] tracking-tight">YTubViral<span style={{ color: 'var(--red)' }}>.</span>com</span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/dashboard" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              {t('Panel', 'Dashboard')}
            </a>
            <a href="/analytics" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
              Analytics
            </a>
            <a href="/coach" className="hidden md:flex items-center gap-1.5 font-mono-jb text-[11px] tracking-wider text-zinc-500 hover:text-white transition border border-white/10 rounded px-3 py-1.5 hover:border-white/25">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              AI Coach
            </a>
            <a href="/profile" title={t('Mi perfil', 'My profile')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-white/30 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </a>
            <button onClick={() => signOut({ callbackUrl: '/' })} title={t('Cerrar sesión', 'Sign out')} className="flex items-center justify-center w-8 h-8 rounded-full border border-white/15 hover:border-red-500/50 transition" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </button>
          </div>
        </div>
      </nav>

      {/* Header with month nav */}
      <div className="border-b border-white/10" style={{ background: '#0B0B0D' }}>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <p className="font-mono-jb text-[11px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--red)' }}>
            {t('CALENDARIO DE CONTENIDO', 'CONTENT CALENDAR')}
          </p>
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="text-zinc-400 hover:text-white transition p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-white min-w-[220px] text-center">
              {MONTH_NAMES[lang][month]} {year}
            </h1>
            <button onClick={nextMonth} className="text-zinc-400 hover:text-white transition p-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
          {/* Status legend */}
          <div className="flex gap-4 mt-3 flex-wrap">
            {Object.entries(STATUS_LABELS).map(([key, labels]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[key] }} />
                <span className="font-mono-jb text-[10px] text-zinc-500">{labels[lang]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="text-center py-8">
            <p className="text-red-400 font-mono-jb text-sm">{error}</p>
          </div>
        )}

        {loading && !entries.length && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!error && (
          <>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_HEADERS[lang].map(d => (
                <div key={d} className="text-center font-mono-jb text-[10px] text-zinc-600 uppercase tracking-wider py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((dateStr, i) => {
                if (!dateStr) {
                  return <div key={`empty-${i}`} className="min-h-[100px] rounded-lg" style={{ background: 'rgba(255,255,255,0.01)' }} />;
                }
                const dayNum = parseInt(dateStr.slice(8), 10);
                const dayEntries = entries.filter(e => e.date === dateStr);
                const isToday = dateStr === today;

                return (
                  <div
                    key={dateStr}
                    className="min-h-[100px] rounded-lg p-1.5 border transition cursor-pointer hover:border-white/20 group"
                    style={{
                      background: isToday ? 'rgba(155,32,32,0.08)' : 'rgba(255,255,255,0.02)',
                      borderColor: isToday ? 'rgba(155,32,32,0.3)' : 'rgba(255,255,255,0.06)',
                    }}
                    onClick={() => openAdd(dateStr)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-mono-jb text-[11px] ${isToday ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                        {dayNum}
                      </span>
                      <span className="text-zinc-700 opacity-0 group-hover:opacity-100 transition text-[10px]">+</span>
                    </div>
                    <div className="space-y-0.5">
                      {dayEntries.map(entry => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono-jb truncate cursor-pointer hover:brightness-125 transition"
                          style={{ background: `${STATUS_COLORS[entry.status]}22`, color: STATUS_COLORS[entry.status] }}
                          onClick={e => { e.stopPropagation(); openEdit(entry); }}
                          title={entry.title}
                        >
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[entry.status] }} />
                          <span className="truncate">{entry.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-md mx-4 rounded-xl border border-white/10 p-6"
            style={{ background: '#141416' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-display font-bold text-lg text-white mb-4">
              {modal.mode === 'add' ? t('Añadir contenido', 'Add content') : t('Editar contenido', 'Edit content')}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                  {t('Título', 'Title')}
                </label>
                <input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={t('Ej: Tutorial de edición con DaVinci', 'Ex: DaVinci editing tutorial')}
                  className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm font-mono-jb text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                  maxLength={200}
                  autoFocus
                />
              </div>

              <div>
                <label className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                  {t('Descripción', 'Description')}
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder={t('Notas, ideas, guión...', 'Notes, ideas, script...')}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-white/15 px-3 py-2 text-sm font-mono-jb text-white placeholder-zinc-600 focus:outline-none focus:border-white/30 transition"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                    {t('Fecha', 'Date')}
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm font-mono-jb text-white focus:outline-none focus:border-white/30 transition"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  />
                </div>
                <div>
                  <label className="font-mono-jb text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">
                    {t('Estado', 'Status')}
                  </label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm font-mono-jb text-white focus:outline-none focus:border-white/30 transition"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    {Object.entries(STATUS_LABELS).map(([key, labels]) => (
                      <option key={key} value={key}>{labels[lang]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={saveEntry}
                disabled={saving || !form.title.trim()}
                className="btn-offset flex-1 py-2.5 text-sm font-display rounded-lg disabled:opacity-30"
              >
                {saving ? t('Guardando...', 'Saving...') : modal.mode === 'add' ? t('Añadir', 'Add') : t('Guardar', 'Save')}
              </button>
              {modal.mode === 'edit' && (
                <button
                  onClick={deleteEntry}
                  disabled={saving}
                  className="px-4 py-2.5 text-sm font-mono-jb text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition disabled:opacity-30"
                >
                  {t('Eliminar', 'Delete')}
                </button>
              )}
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2.5 text-sm font-mono-jb text-zinc-500 hover:text-white transition"
              >
                {t('Cancelar', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
