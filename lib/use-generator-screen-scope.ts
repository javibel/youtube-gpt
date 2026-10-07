'use client';

import { useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';

export function useGeneratorScreenScope(userId: string | undefined, email: string | null | undefined,
  status: string, lang: string) {
  const scope = useMemo(() => ({ active: true, key: JSON.stringify([userId,email,status,lang]) }),
    [userId,email,status,lang]);
  const latest = useRef(scope); latest.current = scope;
  useEffect(() => {
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  return { scope, current: () => scope.active && latest.current === scope
    && status === 'authenticated' && !!userId && !!email && ['es','en'].includes(lang) };
}

export type GeneratorScreenScope = ReturnType<typeof useGeneratorScreenScope>;

// Hide former account state during render, before effect cleanup, and reject captured setters.
export function useGeneratorScreenState<T>(owner: GeneratorScreenScope, initial: T) {
  const [store,setStore] = useState(() => ({ scope: owner.scope, value: initial }));
  useEffect(() => { setStore({ scope: owner.scope, value: initial }); }, [owner.scope]);
  const value = store.scope === owner.scope && owner.current() ? store.value : initial;
  const setValue = (next: SetStateAction<T>) => {
    if (!owner.current()) return;
    setStore(old => {
      if (!owner.current()) return old;
      const prior = old.scope === owner.scope ? old.value : initial;
      return { scope: owner.scope, value: typeof next === 'function'
        ? (next as (value: T) => T)(prior) : next };
    });
  };
  return [value,setValue] as const;
}
