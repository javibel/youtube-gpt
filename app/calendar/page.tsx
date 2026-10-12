'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createRetryOperation } from '@/lib/ai/retry-operation.cjs';
import { useSession } from 'next-auth/react';
import { calendarMonthRange, decodeCalendarRead } from '@/lib/calendar-read-contract';
import { parseCalendarCreation, parseCalendarMutation, decodeCalendarWrite } from '@/lib/calendar-write-contract';
import DashboardShell from '@/components/DashboardShell';
import { useLang } from '@/components/LangProvider';
import ToolLoginGate from '@/components/ToolLoginGate';

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
  scheduled: '#ef4444',
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
  const range = calendarMonthRange(year, month);
  if (!range) return [];
  const firstDay = new Date(range.from + 'T00:00:00.000Z');
  let startOffset = firstDay.getUTCDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const days: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= Number(range.to.slice(8)); d++) {
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    days.push(String(year).padStart(4, '0') + '-' + mm + '-' + dd);
  }
  return days;
}

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const lang = useLang();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());

  // Modal state
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; entry?: Entry; date?: string; identity: object } | null>(null);
  const modalIdentity = useRef<object | null>(null);
  const [form, setForm] = useState({ title: '', description: '', status: 'idea', date: '' });
  const [saving, setSaving] = useState(false);

  // AI suggestions state
  const [suggestions, setSuggestions] = useState<{ title: string; date: string; hour: number; reason: string; description: string }[]>([]);
  const currentSuggestions = useRef(suggestions);
  currentSuggestions.current = suggestions;
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [addingSuggestion, setAddingSuggestion] = useState<number | null>(null);
  const [suggestError, setSuggestError] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const suggestionSlot = 'ytv:calendar:pending:v1:' + JSON.stringify([session?.user?.id, session?.user?.email, lang]);
  // Untrusted same-tab selection only; it cannot admit or restart server work.
  function readPending(): { version: number; key: string; lang: Lang } | null {
    if (status !== 'authenticated' || !session?.user?.id || !session.user.email) return null;
    try {
      const raw = sessionStorage.getItem(suggestionSlot);
      if (!raw || raw.length > 512) return null;
      const value = JSON.parse(raw);
      return value?.version === 1 && Object.keys(value).sort().join(',') === 'key,lang,version'
        && typeof value.key === 'string' && /^[-A-Za-z0-9._:]{1,128}$/.test(value.key)
        && value.lang === lang && ['es', 'en'].includes(lang) ? value : null;
    } catch { return null; }
  }
  function clearPending(key: string | null) {
    try { if (key && readPending()?.key === key) sessionStorage.removeItem(suggestionSlot); } catch { /* Retain memory fallback. */ }
  }
  const suggestionOperation = useMemo(() => ({
    run: createRetryOperation(() => crypto.randomUUID()),
    key: null as string | null,
    busy: false,
    active: true,
    controller: null as AbortController | null,
  }), [session?.user?.id, session?.user?.email, status, lang]);
  const currentSuggestionOperation = useRef(suggestionOperation);
  currentSuggestionOperation.current = suggestionOperation;
  useEffect(() => {
    suggestionOperation.active = true;
    setSuggestions([]);
    setSuggestError('');
    setSuggestLoading(false);
    setStorageWarning(false);
    const retained = readPending();
    if (retained) {
      suggestionOperation.run = createRetryOperation(() => retained.key);
      suggestionOperation.key = retained.key;
      setShowSuggestions(true);
      setSuggestError(lang === 'en'
        ? 'An unconfirmed request was restored. Retry only retrieves the original result; it never starts another generation. Discarding does not cancel server work.'
        : 'Se restauró una solicitud sin confirmar. Reintentar solo consulta el resultado original; no inicia otra generación. Descartar no cancela el trabajo del servidor.');
    }
    return () => { suggestionOperation.active = false; suggestionOperation.controller?.abort(); };
  }, [suggestionOperation]);

  const t = (es: string, en: string) => lang === 'en' ? en : es;

  const [readGeneration, setReadGeneration] = useState(0);
  const readScope = useMemo(() => ({ active: true, busy: false, controller: null as AbortController | null,
    owner: Object.freeze({ id: typeof session?.user?.id === 'string' ? session.user.id : '',
      email: typeof session?.user?.email === 'string' ? session.user.email : '' }),
    range: calendarMonthRange(year, month),
  }), [session?.user?.id, session?.user?.email, status, lang, year, month, readGeneration]);
  const currentReadScope = useRef(readScope);
  currentReadScope.current = readScope;
  const confirmedReadScope = useRef<typeof readScope | null>(null);
  const modalScope = useRef<typeof readScope | null>(null);
  const creationSlot = 'ytv:calendar:create:v1:' + JSON.stringify([session?.user?.id, session?.user?.email, lang]);
  type Creation = Readonly<{ key: string; body: string; done?: () => void; scope?: typeof readScope }>;
  const creation = useMemo(() => ({ pending: null as Creation | null, storageWarning: false }),
    [session?.user?.id, session?.user?.email, status, lang]);
  const currentCreation = useRef(creation); currentCreation.current = creation;
  const writeNoticeScope = useRef<object | null>(null);
  function readCreation(): Creation | null {
    if (status !== 'authenticated' || !session?.user?.id || !session.user.email) return null;
    try {
      const raw = sessionStorage.getItem(creationSlot);
      if (!raw || raw.length > 66000) return null;
      const value = JSON.parse(raw);
      if (value?.version !== 1 || Object.keys(value).sort().join(',') !== 'body,key,version'
        || typeof value.key !== 'string' || !/^[-A-Za-z0-9._:]{1,128}$/.test(value.key)
        || typeof value.body !== 'string' || value.body.length > 65536) return null;
      parseCalendarCreation(value.body);
      return Object.freeze({ key: value.key, body: value.body });
    } catch { return null; }
  }
  function clearCreation(pending: Creation) {
    try {
      const stored = readCreation();
      if (stored?.key === pending.key && stored.body === pending.body) sessionStorage.removeItem(creationSlot);
    } catch { /* Never erase a different original selector. */ }
  }
  function creationMessage() {
    return t('El alta no está confirmada y puede haberse aplicado. Reintentar alta solo consulta la entrada original; no crea otra. Empezar otra operación descarta este selector, no cancela el servidor y puede duplicar el alta.',
      'The addition is unconfirmed and may have been applied. Retry addition only retrieves the original entry; it never creates another. Starting another operation discards this selector, does not cancel server work and may duplicate the addition.');
  }
  useEffect(() => { creation.pending = readCreation(); }, [creation]);
  type Mutation = Creation & Readonly<{ method: 'PUT' | 'DELETE'; id: string; url: string }>;
  const mutationSlot = 'ytv:calendar:mutation:v1:' + JSON.stringify([session?.user?.id, session?.user?.email, lang]);
  const mutation = useMemo(() => ({ pending: null as Mutation | null, storageWarning: false }),
    [session?.user?.id, session?.user?.email, status, lang]);
  const currentMutation = useRef(mutation); currentMutation.current = mutation;
  function snapshot(entry: Entry) {
    return { title: entry.title, description: entry.description, date: entry.date, status: entry.status, color: entry.color };
  }
  function readMutation(): Mutation | null {
    if (status !== 'authenticated' || !session?.user?.id || !session.user.email) return null;
    try {
      const raw = sessionStorage.getItem(mutationSlot);
      if (!raw || raw.length > 66000) return null;
      const v = JSON.parse(raw);
      if (v?.version !== 1 || Object.keys(v).sort().join(',') !== 'body,id,key,method,version'
        || typeof v.key !== 'string' || !/^[-A-Za-z0-9._:]{1,128}$/.test(v.key)
        || !['PUT','DELETE'].includes(v.method) || typeof v.id !== 'string' || !v.id || v.id.length > 128
        || typeof v.body !== 'string' || v.body.length > 65536) return null;
      parseCalendarMutation(v.body, v.method, v.id);
      return Object.freeze({ key: v.key, body: v.body, method: v.method, id: v.id,
        url: v.method === 'PUT' ? '/api/calendar' : '/api/calendar?id=' + encodeURIComponent(v.id) });
    } catch { return null; }
  }
  function clearMutation(pending: Mutation) {
    try {
      const stored = readMutation();
      if (stored?.key === pending.key && stored.body === pending.body && stored.id === pending.id && stored.method === pending.method) sessionStorage.removeItem(mutationSlot);
    } catch { /* A newer selector must remain untouched. */ }
  }
  function mutationMessage() {
    return t('El cambio no está confirmado y puede haberse aplicado. Reintentar el cambio solo consulta el acuse original; no repite la edición ni el borrado. Ese acuse confirma la operación pasada, no el estado actual del calendario. Empezar otra operación no cancela el servidor.',
      'The change is unconfirmed and may have been applied. Retry change only retrieves the original acknowledgement; it does not repeat the edit or deletion. That acknowledgement confirms the past operation, not the current calendar state. Starting another operation does not cancel server work.');
  }
  useEffect(() => { mutation.pending = readMutation(); }, [mutation]);
  const writes = useMemo(() => ({ busy: false, unconfirmed: false, controller: null as AbortController | null }), [readScope]);
  const [writeError, setWriteError] = useState('');
  const offeredCreation = creation.pending;
  const offeredMutation = mutation.pending;
  useEffect(() => {
    modalIdentity.current = null;
    setModal(null); setForm({ title: '', description: '', status: 'idea', date: '' });
    writeNoticeScope.current = writes;
    writes.unconfirmed = !!creation.pending || !!mutation.pending;
    setWriteError(mutation.pending ? mutationMessage() : creation.pending ? creationMessage() : ''); setSaving(false); setAddingSuggestion(null);
    return () => { writes.controller?.abort(); };
  }, [writes]);
  useEffect(() => {
    // A retired generation is never reactivated by repeated effect setup.
    if (!readScope.active) { setReadGeneration(value => value + 1); return; }
    setEntries([]); setError(''); setLoading(false);
    return () => { readScope.active = false; readScope.controller?.abort(); };
  }, [readScope]);

  const fetchEntries = useCallback(async () => {
    if (status !== 'authenticated' || !readScope.owner.id || !readScope.owner.email
      || !readScope.active || readScope.busy || currentReadScope.current !== readScope) return;
    const range = readScope.range;
    if (!range) { setError(t('El mes no es válido.', 'The month is invalid.')); return; }
    // Admission is synchronous, before transport or a second captured click.
    readScope.busy = true;
    const owner = readScope.owner, controller = new AbortController(); readScope.controller = controller;
    const expires = performance.now() + 30_000;
    const ownsView = () => readScope.active && currentReadScope.current === readScope && readScope.controller === controller;
    let interrupt: (error: Error) => void = () => {};
    const interrupted = new Promise<never>((_, reject) => { interrupt = reject; });
    void interrupted.catch(() => {});
    const abort = () => interrupt(new Error('Calendar read unconfirmed'));
    controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 30_000);
    const check = () => {
      if (!ownsView() || controller.signal.aborted || performance.now() >= expires) {
        controller.abort(); throw new Error('Calendar read unconfirmed');
      }
    };
    setLoading(true); setError('');
    try {
      check();
      const res = await Promise.race([fetch('/api/calendar?from=' + range.from + '&to=' + range.to, {
        method: 'GET', cache: 'no-store', signal: controller.signal,
      }), interrupted]);
      check();
      if (!res.ok || res.status !== 200) throw new Error('Calendar unavailable');
      const json: unknown = await Promise.race([res.json(), interrupted]);
      check();
      const receipt = decodeCalendarRead(json, owner, range);
      check();
      confirmedReadScope.current = readScope; setEntries([...receipt.entries]);
    } catch {
      if (ownsView()) { confirmedReadScope.current = null; setError(t('No se pudo confirmar el calendario. Puedes volver a consultarlo.', 'The calendar could not be confirmed. You can retrieve it again.')); }
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', abort);
      if (ownsView()) setLoading(false);
      if (readScope.controller === controller) { readScope.controller = null; readScope.busy = false; }
    }
  }, [readScope, status, lang]);

  useEffect(() => {
    if (status === 'authenticated') void fetchEntries();
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
    if (!canWrite()) return;
    modalScope.current = readScope;
    setForm({ title: '', description: '', status: 'idea', date });
    const identity = {}; modalIdentity.current = identity;
    setModal({ mode: 'add', date, identity });
  }

  function openEdit(entry: Entry) {
    if (!canWrite()) return;
    modalScope.current = readScope;
    setForm({ title: entry.title, description: entry.description || '', status: entry.status, date: entry.date });
    const identity = {}; modalIdentity.current = identity;
    setModal({ mode: 'edit', entry, identity });
  }

  function canWrite() {
    return status === 'authenticated' && !!session?.user?.id && readScope.active && confirmedReadScope.current === readScope
      && currentReadScope.current === readScope && currentCreation.current === creation && currentMutation.current === mutation && !creation.pending && !mutation.pending && !writes.busy && !writes.unconfirmed;
  }

  async function writeCalendar(url: string, init: RequestInit, done: () => void,
    suggestionIndex: number | null = null, retained: Creation | Mutation | null = null) {
    if (status !== 'authenticated' || !readScope.owner.id || !readScope.owner.email
      || (retained ? !readScope.active || currentReadScope.current !== readScope
        || currentCreation.current !== creation || currentMutation.current !== mutation || writes.busy
        || ('method' in retained ? mutation.pending !== retained : creation.pending !== retained) : !canWrite())) return;
    // One admission, before parsing, persistence or a second captured click.
    writes.busy = true;
    const expires = performance.now() + 30_000, owner = Object.freeze({ ...readScope.owner });
    const controller = new AbortController(); writes.controller = controller;
    const current = () => readScope.active && currentReadScope.current === readScope
      && currentCreation.current === creation && currentMutation.current === mutation && writes.controller === controller;
    let original = retained, dispatched = false;
    let interrupt: (error: Error) => void = () => {};
    const interrupted = new Promise<never>((_, reject) => { interrupt = reject; }); void interrupted.catch(() => {});
    const abort = () => interrupt(new Error('Calendar write unconfirmed'));
    controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 30_000);
    const check = () => {
      if (!current() || controller.signal.aborted || performance.now() >= expires
        || (original && ('method' in original ? mutation.pending !== original : creation.pending !== original))) {
        controller.abort(); throw Error('Calendar write unconfirmed');
      }
    };
    setSaving(true); setAddingSuggestion(suggestionIndex); setWriteError('');
    try {
      check();
      const method = retained && 'method' in retained ? retained.method : retained ? 'POST' : init.method;
      const body = retained ? retained.body : init.body;
      if (typeof body !== 'string' || !['POST', 'PUT', 'DELETE'].includes(method as string)) throw Error('Invalid input');
      const selectedId = method === 'PUT' ? JSON.parse(body)?.id : method === 'DELETE'
        ? decodeURIComponent(url.slice('/api/calendar?id='.length)) : null;
      const input = method === 'POST' ? parseCalendarCreation(body) : parseCalendarMutation(body, method as 'PUT' | 'DELETE', selectedId);
      const target = method === 'DELETE' ? '/api/calendar?id=' + encodeURIComponent(input.id!) : '/api/calendar';
      if (url !== target || (retained && 'method' in retained && (retained.id !== input.id || retained.url !== target))) throw Error('Invalid input');
      check();
      if (!original) {
        const key = crypto.randomUUID();
        if (method === 'POST') {
          original = Object.freeze({ key, body, done, scope: readScope }); creation.pending = original;
        } else {
          const pending: Mutation = Object.freeze({ key, body, method: method as 'PUT' | 'DELETE', id: input.id!, url: target, done, scope: readScope });
          original = pending; mutation.pending = pending;
        }
        let stored = false;
        try {
          const slot = method === 'POST' ? creationSlot : mutationSlot;
          const raw = JSON.stringify(method === 'POST' ? { version: 1, key, body }
            : { version: 1, key, body, method, id: input.id });
          if (raw.length <= 66000) { sessionStorage.setItem(slot, raw); stored = sessionStorage.getItem(slot) === raw; }
        } catch { /* The exact original remains in memory; no browser durability claimed. */ }
        if (method === 'POST') creation.storageWarning = !stored; else mutation.storageWarning = !stored;
      }
      const selected = Object.freeze({ key: original.key, body: original.body, method, target });
      if (!/^[-A-Za-z0-9._:]{1,128}$/.test(selected.key)) throw Error('Invalid original key');
      check();
      dispatched = true;
      const response = await Promise.race([fetch(selected.target, { method: selected.method,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': selected.key,
          ...(retained ? { 'X-Calendar-Write-Recovery': 'retained-only-v1' } : {}) },
        body: selected.body, signal: controller.signal,
      }), interrupted]);
      check();
      if (!response.ok || response.status !== (input.method === 'POST' ? 201 : 200)) throw Error('Write unavailable');
      const json: unknown = await Promise.race([response.json(), interrupted]);
      check();
      decodeCalendarWrite(json, owner, input);
      check();
      if (creation.pending === original) { clearCreation(original); creation.pending = null; creation.storageWarning = false; }
      if (mutation.pending === original) { clearMutation(original as Mutation); mutation.pending = null; mutation.storageWarning = false; }
      writes.unconfirmed = !!creation.pending || !!mutation.pending;
      if (writes.unconfirmed) setWriteError(mutation.pending ? mutationMessage() : creationMessage());
      done();
      // Refresh a complete own snapshot; it does not confirm another writer.
      if (current()) { readScope.controller?.abort(); readScope.busy = false; void fetchEntries(); }
    } catch {
      if (current()) {
        writes.unconfirmed = !!original || dispatched;
        setWriteError(original ? ('method' in original ? mutationMessage() : creationMessage())
          : t('No se pudo iniciar el cambio. Revisa los campos y el tamaño de la entrada.',
            'The change could not be started. Check the entry fields and size.'));
      }
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', abort);
      if (current()) { setSaving(false); setAddingSuggestion(null); }
      writes.busy = false; if (writes.controller === controller) writes.controller = null;
    }
  }

  function discardUnconfirmedWrite() {
    if (status !== 'authenticated' || !readScope.active || currentReadScope.current !== readScope || writes.busy) return;
    // Discarding a local warning neither cancels nor certifies the server write.
    if (currentCreation.current !== creation || currentMutation.current !== mutation || creation.pending !== offeredCreation || mutation.pending !== offeredMutation) return;
    if (creation.pending) clearCreation(creation.pending);
    creation.pending = null; creation.storageWarning = false;
    if (mutation.pending) clearMutation(mutation.pending);
    mutation.pending = null; mutation.storageWarning = false;
    writes.unconfirmed = false; setWriteError('');
  }

  async function retryCalendarCreation() {
    const original = offeredCreation;
    if (!original) return;
    return writeCalendar('/api/calendar', { method: 'POST' },
      () => { if (original.scope === readScope) original.done?.(); }, null, original);
  }
  async function retryCalendarMutation() {
    const original = offeredMutation;
    if (!original) return;
    return writeCalendar(original.url, { method: original.method },
      () => { if (original.scope === readScope) original.done?.(); }, null, original);
  }

  async function saveEntry() {
    if (!form.title.trim() || !modal || modalScope.current !== readScope || modalIdentity.current !== modal.identity || !canWrite()) return;
    const values = { ...form, title: form.title.trim(), description: form.description.trim() };
    const editing = modal.mode === 'edit' && modal.entry;
    return writeCalendar('/api/calendar', { method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing ? { id: editing.id, ...values, expected: snapshot(editing) } : values) },
      () => { modalIdentity.current = null; setModal(null); });
  }

  async function deleteEntry() {
    if (!modal?.entry || modalScope.current !== readScope || modalIdentity.current !== modal.identity) return;
    return writeCalendar(`/api/calendar?id=${encodeURIComponent(modal.entry.id)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected: snapshot(modal.entry) }) },
      () => { modalIdentity.current = null; setModal(null); });
  }

  async function fetchSuggestions() {
    if (status !== 'authenticated' || !session?.user?.id || !suggestionOperation.active || suggestionOperation.busy
      || currentSuggestionOperation.current !== suggestionOperation) return;
    const operation = suggestionOperation;
    operation.busy = true;
    const controller = new AbortController();
    operation.controller = controller;
    let timedOut = false;
    let stopWait: (error: Error) => void = () => {};
    const interrupted = new Promise<never>((_, reject) => { stopWait = reject; });
    // Cleanup may close the wait before the transport microtask starts.
    void interrupted.catch(() => {});
    const abort = () => stopWait(new Error('Unconfirmed suggestions'));
    controller.signal.addEventListener('abort', abort, { once: true });
    const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 90_000);
    setSuggestLoading(true);
    setShowSuggestions(true);
    setSuggestError('');
    setSuggestions([]);
    try {
      const result = await operation.run({ lang }, async (body, operationKey) => {
        if (!operation.active || currentSuggestionOperation.current !== operation || controller.signal.aborted) throw new Error('Account changed');
        const readOnly = operation.key === operationKey;
        operation.key = operationKey;
        let stored = false;
        try {
          if (session?.user?.email) {
            const value = JSON.stringify({ version: 1, key: operationKey, lang });
            sessionStorage.setItem(suggestionSlot, value);
            stored = sessionStorage.getItem(suggestionSlot) === value;
          }
        } catch { /* The exact pending request remains in memory. */ }
        setStorageWarning(!stored);
        const res = await Promise.race([fetch('/api/calendar/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operationKey,
            ...(readOnly ? { 'X-Calendar-Recovery': 'retained-only-v1' } : {}) },
          body,
          signal: controller.signal,
        }), interrupted]);
        if (!res.ok) throw new Error('Suggestions unavailable');
        const json = await Promise.race([res.json(), interrupted]);
        if (controller.signal.aborted) throw new Error('Unconfirmed suggestions');
        if (!Array.isArray(json.suggestions) || json.suggestions.length > 5 || json.suggestions.some((item: unknown) => {
          if (!item || typeof item !== 'object') return true;
          const s = item as Record<string, unknown>;
          return typeof s.title !== 'string' || !s.title.trim() || typeof s.date !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Number.isInteger(s.hour) ||
            (s.hour as number) < 0 || (s.hour as number) > 23 ||
            typeof s.reason !== 'string' || typeof s.description !== 'string';
        })) throw new Error('Invalid suggestions');
        return json.suggestions as typeof suggestions;
      });
      if (operation.active && currentSuggestionOperation.current === operation) {
        clearPending(operation.key);
        operation.key = null;
        operation.run = createRetryOperation(() => crypto.randomUUID());
        setStorageWarning(false);
        setSuggestions(result);
      }
    } catch {
      if (operation.active && currentSuggestionOperation.current === operation) setSuggestError((timedOut ? t(
        'La espera terminó a los 90 segundos. ', 'The wait ended after 90 seconds. ',
      ) : '') + t(
        'Las sugerencias no están confirmadas. Reintentar solo consulta el resultado original. Puedes descartar esta solicitud para empezar otra; no cancela el trabajo del servidor y la nueva puede consumir créditos.',
        'Suggestions are unconfirmed. Retry only retrieves the original result. You can discard this request to start another; it does not cancel server work and the new request may consume credits.',
      ));
    } finally {
      operation.busy = false;
      clearTimeout(deadline);
      controller.signal.removeEventListener('abort', abort);
      if (operation.controller === controller) operation.controller = null;
      if (operation.active && currentSuggestionOperation.current === operation) setSuggestLoading(false);
    }
  }

  function discardSuggestions() {
    const operation = suggestionOperation;
    if (status !== 'authenticated' || !operation.active || operation.busy
      || currentSuggestionOperation.current !== operation) return;
    clearPending(operation.key);
    operation.run = createRetryOperation(() => crypto.randomUUID());
    operation.key = null;
    setSuggestError('');
    setSuggestions([]);
    setStorageWarning(false);
  }

  async function addSuggestionToCalendar(idx: number) {
    const s = suggestions[idx];
    if (!s || currentSuggestions.current[idx] !== s || !suggestionOperation.active || currentSuggestionOperation.current !== suggestionOperation) return;
    const values = { title: s.title.trim(), description: `${s.description}\n\n⏰ ${t('Hora sugerida', 'Suggested time')}: ${s.hour}:00 UTC\n💡 ${s.reason}`.trim(),
      date: s.date, status: 'idea' };
    return writeCalendar('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) },
      () => {
        currentSuggestions.current = currentSuggestions.current.filter(item => item !== s);
        setSuggestions(currentSuggestions.current);
      }, idx);
  }

  async function cycleStatus(entry: Entry) {
    const order = ['idea', 'draft', 'scheduled', 'published'];
    const nextIdx = (order.indexOf(entry.status) + 1) % order.length;
    const newStatus = order[nextIdx];
    return writeCalendar('/api/calendar', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, status: newStatus, expected: snapshot(entry) }) }, () => {});
  }

  function closeModal() {
    if (readScope.active && currentReadScope.current === readScope && !writes.busy) { modalIdentity.current = null; setModal(null); }
  }
  function changeForm(field: keyof typeof form, value: string) {
    if (!modal || modalIdentity.current !== modal.identity || modalScope.current !== readScope || currentReadScope.current !== readScope || !readScope.active || writes.busy) return;
    setForm(previous => ({ ...previous, [field]: value }));
  }
  const writeNotice = writeNoticeScope.current === writes && writeError && <div role="alert" className="mb-4 text-sm text-red-400">
    <p>{writeError}</p>
    {mutation.pending && <button onClick={retryCalendarMutation} disabled={saving} className="mt-2 mr-4 underline disabled:opacity-50">
      {t('Reintentar cambio original', 'Retry original change')}
    </button>}
    {mutation.pending && mutation.storageWarning && <p>{t('No se pudo conservar este cambio en la pestaña. La consulta original sigue en memoria; recargar puede perderla.',
      'This change could not be retained in the tab. The original query remains in memory; reload may lose it.')}</p>}
    {creation.pending && <button onClick={retryCalendarCreation} disabled={saving} className="mt-2 mr-4 underline disabled:opacity-50">
      {t('Reintentar alta original', 'Retry original addition')}
    </button>}
    {creation.pending && creation.storageWarning && <p>{t('No se pudo conservar este intento en la pestaña. La consulta original sigue disponible en memoria; recargar puede perderla.',
      'This attempt could not be retained in the tab. The original query remains available in memory; reload may lose it.')}</p>}
    <button onClick={fetchEntries} disabled={loading || saving} className="mt-2 underline disabled:opacity-50">
      {t('Consultar calendario', 'Retrieve calendar')}
    </button>
    <button onClick={discardUnconfirmedWrite} disabled={saving} className="mt-2 ml-4 underline disabled:opacity-50">
      {t('Empezar otra operación', 'Start another operation')}
    </button>
  </div>;

  const days = getMonthDays(year, month);
  const today = new Date().toISOString().slice(0, 10);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--yv-light)', color: 'var(--yv-text-1)' }}>
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <ToolLoginGate
        eyebrow={{ es: 'CALENDARIO DE CONTENIDO', en: 'CONTENT CALENDAR' }}
        title={{ es: 'Planifica tu contenido', en: 'Plan Your Content' }}
        highlight={{ es: 'como un profesional', en: 'Like a Pro' }}
        description={{
          es: 'Calendario visual para planificar, programar y trackear tus vídeos de YouTube. Desde la idea hasta la publicación, todo en un sitio.',
          en: 'Visual calendar to plan, schedule, and track your YouTube videos. From idea to publication, all in one place.',
        }}
        featuresHref="/features/content-calendar"
        bullets={[
          { icon: '/icons/clock-fast.webp', title: { es: 'Vista mensual', en: 'Monthly view' }, desc: { es: 'Ve de un vistazo qué días tienes contenido planificado', en: 'See at a glance which days have planned content' } },
          { icon: '/icons/gears.webp', title: { es: '4 estados', en: '4 statuses' }, desc: { es: 'Idea → Borrador → Programado → Publicado', en: 'Idea → Draft → Scheduled → Published' } },
          { icon: '/icons/brain.webp', title: { es: 'Sugerencias con IA', en: 'AI suggestions' }, desc: { es: 'La IA propone qué grabar según tendencias y tu competencia', en: 'AI suggests what to film based on trends and your competitors' } },
        ]}
      />
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
              <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>{labels[lang]}</span>
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
                <span className="font-mono-jb text-[13px] text-purple-400/70">
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

            {storageWarning && <p role="status" className="mb-4 text-sm text-amber-400">{t(
              'Esta solicitud solo se conserva en memoria. Si recargas o cierras la pestaña, perderás su reintento.',
              'This request is retained only in memory. Reloading or closing the tab will lose its retry.',
            )}</p>}
            {suggestError && <div role="alert" className="mb-4 text-sm text-red-400">
              <p>{suggestError}</p>
              <button onClick={fetchSuggestions} disabled={suggestLoading} className="mt-2 underline disabled:opacity-50">
                {t('Reintentar sugerencias', 'Retry suggestions')}
              </button>
              <button onClick={discardSuggestions} disabled={suggestLoading} className="mt-2 ml-4 underline disabled:opacity-50">
                {t('Descartar solicitud', 'Discard request')}
              </button>
            </div>}
            {suggestLoading && (
              <div className="flex items-center gap-3 py-6 justify-center">
                <div className="w-4 h-4 border-2 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
                <span className="font-mono-jb text-sm" style={{ color: 'var(--yv-text-3)' }}>{t('Analizando tu canal, tendencias y competidores...', 'Analyzing your channel, trends and competitors...')}</span>
              </div>
            )}

            {!suggestLoading && !suggestError && suggestions.length === 0 && (
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
                        <h3 className="font-mono-jb text-[13px] text-white leading-tight line-clamp-2">{s.title}</h3>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono-jb text-[13px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
                          {dayName} {s.date.slice(5)}
                        </span>
                        <span className="font-mono-jb text-[13px]" style={{ color: 'var(--yv-text-3)' }}>
                          {s.hour}:00 UTC
                        </span>
                      </div>
                      <p className="font-mono-jb text-[13px] leading-relaxed line-clamp-2" style={{ color: 'var(--yv-text-3)' }}>{s.reason}</p>
                      <button
                        onClick={() => addSuggestionToCalendar(i)}
                        disabled={saving || writes.unconfirmed}
                        className="mt-auto flex items-center justify-center gap-1.5 py-1.5 rounded text-[13px] font-mono-jb transition border hover:border-purple-500/40 disabled:opacity-40"
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

        {(!modal || modalScope.current !== readScope) && writeNotice}
        {error && (
          <div role="alert" className="text-center py-8">
            <p className="text-red-400 font-mono-jb text-sm">{error}</p>
            <button onClick={fetchEntries} disabled={loading} className="mt-3 underline disabled:opacity-50">
              {t('Volver a consultar calendario', 'Retrieve calendar again')}
            </button>
          </div>
        )}

        {(loading || (!error && confirmedReadScope.current !== readScope)) && (
          <div className="flex items-center gap-3 justify-center py-20">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!error && !loading && confirmedReadScope.current === readScope && (
          <>
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAY_HEADERS[lang].map(d => (
                <div key={d} className="text-center font-mono-jb text-[13px] uppercase tracking-wider py-1" style={{ color: 'var(--yv-text-4)' }}>
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
                    className="min-h-[100px] rounded-lg p-1.5 transition cursor-pointer group"
                    style={{
                      background: isToday ? 'rgba(155,32,32,0.08)' : 'rgba(255,255,255,0.02)',
                      boxShadow: isToday ? 'inset 0 1px 0 rgba(155,32,32,.4)' : 'inset 0 1px 0 rgba(255,255,255,.06)',
                    }}
                    onClick={() => openAdd(dateStr)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono-jb text-[13px]" style={{ color: isToday ? 'var(--yv-brand)' : 'var(--yv-text-3)', fontWeight: isToday ? 700 : 400 }}>
                        {dayNum}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100 transition text-[13px]" style={{ color: 'var(--yv-text-5)' }}>+</span>
                    </div>
                    <div className="space-y-0.5">
                      {dayEntries.map(entry => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[13px] font-mono-jb truncate cursor-pointer hover:brightness-125 transition"
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
      {modal && modalIdentity.current === modal.identity && modalScope.current === readScope && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={closeModal}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="yv-glass yv-glass--lift relative w-full max-w-md mx-4 p-6"
            style={{ borderRadius: 'var(--yv-radius-xl)' }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-display font-bold text-lg text-white mb-4">
              {modal.mode === 'add' ? t('Añadir contenido', 'Add content') : t('Editar contenido', 'Edit content')}
            </h2>
            {writeNotice}

            <div className="space-y-3">
              <div>
                <label className="font-mono-jb text-[13px] uppercase tracking-wider block mb-1" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Título', 'Title')}
                </label>
                <input
                  value={form.title}
                  onChange={e => changeForm('title', e.target.value)}
                  disabled={saving}
                  placeholder={t('Ej: Tutorial de edición con DaVinci', 'Ex: DaVinci editing tutorial')}
                  className="yv-input text-sm font-mono-jb text-white placeholder-zinc-600"
                  maxLength={200}
                  autoFocus
                />
              </div>

              <div>
                <label className="font-mono-jb text-[13px] uppercase tracking-wider block mb-1" style={{ color: 'var(--yv-text-3)' }}>
                  {t('Descripción', 'Description')}
                </label>
                <textarea
                  value={form.description}
                  onChange={e => changeForm('description', e.target.value)}
                  disabled={saving}
                  placeholder={t('Notas, ideas, guión...', 'Notes, ideas, script...')}
                  rows={3}
                  className="yv-input resize-none text-sm font-mono-jb text-white placeholder-zinc-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono-jb text-[13px] uppercase tracking-wider block mb-1" style={{ color: 'var(--yv-text-3)' }}>
                    {t('Fecha', 'Date')}
                  </label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => changeForm('date', e.target.value)}
                    disabled={saving}
                    className="yv-input text-sm font-mono-jb text-white"
                  />
                </div>
                <div>
                  <label className="font-mono-jb text-[13px] uppercase tracking-wider block mb-1" style={{ color: 'var(--yv-text-3)' }}>
                    {t('Estado', 'Status')}
                  </label>
                  <select
                    value={form.status}
                    onChange={e => changeForm('status', e.target.value)}
                    disabled={saving}
                    className="yv-input text-sm font-mono-jb text-white"
                  >
                    {Object.entries(STATUS_LABELS).map(([key, labels]) => (
                      <option key={key} value={key} style={{ background: '#1a1a1e', color: '#fff' }}>{labels[lang]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Link to Generate page for ideas/drafts */}
            {(form.status === 'idea' || form.status === 'draft') && form.title.trim() && (
              <a
                href={`/generate?topic=${encodeURIComponent(form.title.trim())}`}
                className="yv-chip flex items-center justify-center gap-2 mt-4 py-2.5 text-sm font-mono-jb"
                style={{ color: 'var(--yv-text-2)' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                {t('Generar contenido', 'Generate content')}
              </a>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={saveEntry}
                disabled={saving || writes.unconfirmed || !form.title.trim()}
                className="btn-offset flex-1 py-2.5 text-sm font-display rounded-lg disabled:opacity-30"
              >
                {saving ? t('Guardando...', 'Saving...') : modal.mode === 'add' ? t('Añadir', 'Add') : t('Guardar', 'Save')}
              </button>
              {modal.mode === 'edit' && (
                <button
                  onClick={deleteEntry}
                  disabled={saving || writes.unconfirmed}
                  className="px-4 py-2.5 text-sm font-mono-jb text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition disabled:opacity-30"
                >
                  {t('Eliminar', 'Delete')}
                </button>
              )}
              <button
                onClick={closeModal}
                disabled={saving}
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
