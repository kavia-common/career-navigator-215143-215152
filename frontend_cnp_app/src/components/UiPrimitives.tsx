import React from 'react';

/**
 * PUBLIC_INTERFACE
 * Accessible loading indicator with ARIA live updates and minimalist styling.
 */
export const LoadingState: React.FC<{
  label?: string;
  inline?: boolean;
}> = ({ label = 'Loading…', inline = false }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={inline ? '' : 'card'}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: inline ? 0 : undefined,
      }}
    >
      <span
        aria-hidden="true"
        className="skeleton"
        style={{ width: 24, height: 24, borderRadius: '50%', flex: '0 0 24px' }}
      />
      <span>{label}</span>
    </div>
  );
};

/**
 * PUBLIC_INTERFACE
 * Accessible error message block with unified color semantics.
 */
export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  action?: React.ReactNode;
}> = ({ title = 'Something went wrong', message, action }) => {
  return (
    <div role="alert" className="alert alert-error" aria-atomic="true">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: message ? '0.25rem' : 0 }}>
        <strong>{title}</strong>
      </div>
      {message ? <div style={{ marginTop: '0.25rem' }}>{message}</div> : null}
      {action ? <div style={{ marginTop: '0.5rem' }}>{action}</div> : null}
    </div>
  );
};

/**
 * PUBLIC_INTERFACE
 * Standard empty state with optional action.
 */
export const EmptyState: React.FC<{
  title?: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ title = 'Nothing here yet', description = 'There is currently no data to display.', action }) => {
  return (
    <section className="empty-state" aria-label="Empty content">
      <div className="title">{title}</div>
      <div className="desc">{description}</div>
      {action ? <div>{action}</div> : null}
    </section>
  );
};

/**
 * PUBLIC_INTERFACE
 * Semantic status chips using unified Green/Amber/Red semantics.
 */
export const StatusChip: React.FC<{
  status: 'green' | 'amber' | 'red';
  label?: string;
}> = ({ status, label }) => {
  const map: Record<'green' | 'amber' | 'red', string> = {
    green: 'chip chip-green',
    amber: 'chip chip-amber',
    red: 'chip chip-red',
  };
  const ariaLabel = label ?? (status === 'green' ? 'Good' : status === 'amber' ? 'Warning' : 'Critical');
  return (
    <span role="status" aria-label={ariaLabel} className={map[status]}>
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background:
            status === 'green'
              ? 'var(--color-success)'
              : status === 'amber'
              ? 'var(--color-warning)'
              : 'var(--color-error)',
        }}
      />
      <span>{label ?? ariaLabel}</span>
    </span>
  );
};
