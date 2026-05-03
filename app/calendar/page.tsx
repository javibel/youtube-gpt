'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import DashboardShell from '@/components/DashboardShell';
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

  // AI suggestions state
  const [suggestions, setSuggestions] = useState<{ title: string; date: string; hour: number; reason: string; description: string }[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addingSuggestion, setAddingSuggestion] = useState<number | null>(null);

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

  async function fetchSuggestions() {
    setSuggestLoading(true);
    setShowSuggestions(true);
    try {
      const res = await fetch('/api/calendar/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      });
      const json = await res.json();
      if (res.ok && json.suggestions) {
        setSuggestions(json.suggestions);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestLoading(false);
    }
  }

  async function addSuggestionToCalendar(idx: number) {
    const s = suggestions[idx];
    if (!s) return;
    setAddingSuggestion(idx);
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: s.title,
          description: `${s.description}\n\n⏰ ${t('Hora sugerida', 'Suggested time')}: ${s.hour}:00 UTC\n💡 ${s.reason}`,
          date: s.date,
          status: 'idea',
        }),
      });
      if (res.ok) {
        setSuggestions(prev => prev.filter((_, i) => i !== idx));
        fetchEntries();
      }
    } catch { /* */ }
    setAddingSuggestion(null);
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
          <p className="mb-6 font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Inicia sesión para planificar tu contenido.', 'Sign in to plan your content.')}</p>
          <a href="/login" className="btn-offset inline-flex px-8 py-3 text-sm font-display">{t('Iniciar sesión', 'Sign in')}</a>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="yv-page">
        {/* Header with month nav */}
        <header className="yv-page-header">
          <div className="yv-page-header__left">
            <span className="yv-page-header__eyebrow">{t('CALENDARIO DE CONTENIDO', 'CONTENT CALENDAR')}</span>
            <div className="flex items-center gap-4">
              <button onClick={prevMonth} className="hover:text-white transition p-1" style={{ color: 'var(--yv-text-2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <h1 className="yv-page-header__title min-w-[220px] text-center">
                {MONTH_NAMES[lang][month]} {year}
              </h1>
              <button onClick={nextMonth} className="hover:text-white transition p-1" style={{ color: 'var(--yv-text-2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg>
              </button>
            </div>
          </div>
          <div className="yv-page-header__actions">
            <button
              onClick={fetchSuggestions}
              disabled={suggestLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-mono-jb transition hover:border-purple-500/40 disabled:opacity-50"
              style={{ borderColor: 'rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.08)', color: '#c084fc' }}
            >
              {suggestLoading ? (
                <div className="w-3.5 h-3.5 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              )}
              {suggestLoading ? t('Analizando...', 'Analyzing...') : t('AI Planificador', 'AI Scheduler')}
            </button>
          </div>
        </header>

        {/* Status legend */}
        <div className="flex gap-4 flex-wrap mb-6">
          {Object.entries(STATUS_LABELS).map(([key, labels]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLORS[key] }} />
              <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-3)' }}>{labels[lang]}</span>
            </div>
          ))}
        </div>

      {/* AI Suggestions Panel */}
      {showSuggestions && (
        <div className="yv-card mb-6 p-5" style={{ background: 'rgba(168,85,247,0.03)', borderColor: 'rgba(168,85,247,0.15)' }}>
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <h2 className="font-display font-bold text-white text-sm">
                  {t('Sugerencias AI', 'AI Suggestions')}
                </h2>
                <span className="font-mono-jb text-[10px] text-purple-400/70">
                  {t('basado en Best Time + tendencias + competidores', 'based on Best Time + trends + competitors')}
                </span>
              </div>
              <button
                onClick={() => setShowSuggestions(false)}
                className="hover:text-white transition p-1"
                style={{ color: 'var(--yv-text-4)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {suggestLoading && (
              <div className="flex items-center gap-3 py-6 justify-center">
                <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                <span className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Analizando tu canal, tendencias y competidores...', 'Analyzing your channel, trends and competitors...')}</span>
              </div>
            )}

            {!suggestLoading && suggestions.length === 0 && (
              <p className="font-mono-jb text-sm py-4 text-center" style={{ color: 'var(--yv-text-4)' }}>
                {t('No hay sugerencias disponibles. Asegúrate de tener Best Time analizado y canal conectado.', 'No suggestions available. Make sure you have Best Time analyzed and channel connected.')}
              </p>
            )}

            {!suggestLoading && suggestions.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {suggestions.map((s, i) => {
                  const dayName = (() => {
                    const d = new Date(s.date + 'T00:00:00');
                    const names = lang === 'en'
                      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                      : ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                    return names[d.getDay()];
                  })();
                  return (
                    <div
                      key={i}
                      className="rounded-lg border p-3 flex flex-col gap-2"
                      style={{ borderColor: 'rgba(168,85,247,0.15)', background: 'rgba(168,85,247,0.04)' }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-mono-jb text-[12px] text-white leading-tight line-clamp-2">{s.title}</h3>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono-jb text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
                          {dayName} {s.date.slice(5)}
                        </span>
                        <span className="font-mono-jb text-[10px]" style={{ color: 'var(--yv-text-3)' }}>
                          {s.hour}:00 UTC
                        </span>
                      </div>
                      <p className="font-mono-jb text-[10px] leading-relaxed line-clamp-2" style={{ color: 'var(--yv-text-3)' }}>{s.reason}</p>
                      <button
                        onClick={() => addSuggestionToCalendar(i)}
                        disabled={addingSuggestion === i}
                        className="mt-auto flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-mono-jb transition border hover:border-purple-500/40 disabled:opacity-40"
                        style={{ borderColor: 'rgba(168,85,247,0.2)', color: '#c084fc' }}
                      >
                        {addingSuggestion === i ? (
                          <div className="w-3 h-3 border border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                        ) : (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                        )}
                        {t('Añadir', 'Add')}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
                <div key={d} className="text-center font-mono-jb text-[10px] uppercase tracking-wider py-1" style={{ color: 'var(--yv-text-4)' }}>
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
                      <span className="font-mono-jb text-[11px]" style={{ color: isToday ? 'var(--yv-brand)' : 'var(--yv-text-3)', fontWeight: isToday ? 700 : 400 }}>
                        {dayNum}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100 transition text-[10px]" style={{ color: 'var(--yv-text-5)' }}>+</span>
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
            className="relative w-full max-w-md mx-4 rounded-xl p-6"
            style={{ background: 'var(--yv-bg-3)', border: '1px solid var(--yv-border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-display font-bold text-lg text-white mb-4">
              {modal.mode === 'add' ? t('Añadir contenido', 'Add content') : t('Editar contenido', 'Edit content')}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="font-mono-jb text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--yv-text-3)' }}>
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
                <label className="font-mono-jb text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--yv-text-3)' }}>
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
                  <label className="font-mono-jb text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--yv-text-3)' }}>
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
                  <label className="font-mono-jb text-[10px] uppercase tracking-wider block mb-1" style={{ color: 'var(--yv-text-3)' }}>
                    {t('Estado', 'Status')}
                  </label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full rounded-lg border border-white/15 px-3 py-2 text-sm font-mono-jb text-white focus:outline-none focus:border-white/30 transition"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    {Object.entries(STATUS_LABELS).map(([key, labels]) => (
                      <option key={key} value={key} style={{ background: '#1a1a1e', color: '#fff' }}>{labels[lang]}</option>
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
                className="px-4 py-2.5 text-sm font-mono-jb hover:text-white transition"
                style={{ color: 'var(--yv-text-3)' }}
              >
                {t('Cancelar', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
