import type { ReactNode } from 'react';

/** Wraps a page's main query so a slow network shows a skeleton and a failure
 *  shows a retry — previously both rendered as a blank screen, which is
 *  indistinguishable from "the app is broken". */
export default function QueryState({
  isLoading,
  error,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (isLoading) return <PageSkeleton />;

  if (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível carregar os dados.';
    return (
      <div className="empty-state" role="alert" style={{ gap: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--expense-text)', marginBottom: 4 }}>Não consegui carregar</div>
          <div style={{ fontSize: 12.5 }}>{message}</div>
        </div>
        {onRetry && (
          <button className="btn-primary" onClick={onRetry}>
            Tentar de novo
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="skeleton" style={{ height: 96, borderRadius: 'var(--radius-md)' }} />
      <div className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-md)' }} />
      <div className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-md)' }} />
    </div>
  );
}
