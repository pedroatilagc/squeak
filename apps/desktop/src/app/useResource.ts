import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiFailure } from '../api';
import { classifyFailure, type ViewIssue } from '../domain/github';

export type Resource<T> =
  | { status: 'loading'; data: T | null }
  | { status: 'ready'; data: T }
  | { status: 'failed'; issue: ViewIssue; message: string; data: T | null };

/**
 * Carrega um recurso assíncrono e traduz falhas da API em estados de tela.
 * Mantém os dados anteriores durante uma recarga (sem piscar o conteúdo) e ignora respostas atrasadas.
 */
export function useResource<T>(loader: () => Promise<T>, deps: unknown[]): [Resource<T>, () => void] {
  const [state, setState] = useState<Resource<T>>({ status: 'loading', data: null });
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    const mine = ++seq.current;
    setState((s) => ({ status: 'loading', data: s.data }));
    loaderRef.current().then(
      (data) => { if (mine === seq.current) setState({ status: 'ready', data }); },
      (e: unknown) => {
        if (mine !== seq.current) return;
        const f = e instanceof ApiFailure ? e : null;
        setState((s) => ({
          status: 'failed', issue: f ? classifyFailure(f.status, f.code) : 'error',
          message: f ? f.message : 'Falha inesperada', data: s.data,
        }));
      },
    );
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); return () => { seq.current++; }; }, deps);
  return [state, run];
}
