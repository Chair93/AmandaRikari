import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import DateField from './DateField';
import { parseNumberBR } from '../format';

export interface PromptField {
  key: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  /** 'money'/'qty' validate as numbers > 0; 'count' allows zero (an
   *  inventory count of 0 is honest data); 'text' is free-form; 'select'
   *  picks from `options`; 'date' is a native date input (YYYY-MM-DD). */
  kind?: 'money' | 'qty' | 'count' | 'text' | 'select' | 'date';
  options?: { value: string; label: string }[];
  required?: boolean;
}

/** Replaces window.prompt for money/quantity entry. Native prompts are blocked
 *  outright by some corporate browser policies and in-app webviews, silently
 *  killing the flow, and they can't validate — a typo like "1.500,00" used to
 *  sail straight through. This also collects a whole multi-step flow into one
 *  form, so cancelling really cancels instead of committing a half-filled
 *  operation with fallback defaults. */
export default function PromptModal({
  title,
  description,
  fields,
  confirmLabel = 'Confirmar',
  checkboxLabel,
  checkboxDefault = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  description?: string;
  fields: PromptField[];
  confirmLabel?: string;
  checkboxLabel?: string;
  checkboxDefault?: boolean;
  onCancel: () => void;
  onConfirm: (values: Record<string, number | string>, checked: boolean) => void | Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? '']))
  );
  const [checked, setChecked] = useState(checkboxDefault);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const out: Record<string, number | string> = {};

    for (const f of fields) {
      const raw = (values[f.key] ?? '').trim();
      if (f.kind === 'select') {
        out[f.key] = raw;
        continue;
      }
      if (f.kind === 'date') {
        if (f.required !== false && raw === '') return setError(`Preencha ${f.label.toLowerCase()}.`);
        out[f.key] = raw;
        continue;
      }
      if (f.kind === 'text') {
        if (f.required !== false && raw === '') return setError(`Preencha ${f.label.toLowerCase()}.`);
        out[f.key] = raw;
        continue;
      }
      if (raw === '') return setError(`Preencha ${f.label.toLowerCase()}.`);
      const n = parseNumberBR(raw);
      if (n == null) return setError(`Valor inválido em "${f.label}": "${raw}". Use apenas números, ex: 1.500,00`);
      if (f.kind === 'count' ? n < 0 : n <= 0) return setError(`"${f.label}" precisa ser ${f.kind === 'count' ? 'zero ou mais' : 'maior que zero'}.`);
      out[f.key] = n;
    }

    setBusy(true);
    try {
      await onConfirm(out, checked);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não consegui concluir.');
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {description && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{description}</div>}
        {fields.map((f, i) => (
          <label className="field" key={f.key}>
            {f.label}
            {f.kind === 'select' ? (
              <select className="input" value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                {(f.options || []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.kind === 'date' ? (
              <DateField value={values[f.key] ?? ''} onChange={(iso) => setValues((v) => ({ ...v, [f.key]: iso }))} ariaLabel={f.label} />
            ) : (
              <input
                className="input"
                inputMode={f.kind === 'text' ? undefined : 'decimal'}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus={i === 0}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            )}
            {f.hint && <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--text-muted)' }}>{f.hint}</span>}
          </label>
        ))}

        {checkboxLabel && (
          <button
            type="button"
            onClick={() => setChecked((c) => !c)}
            aria-pressed={checked}
            style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)' }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 18,
                height: 18,
                flex: 'none',
                borderRadius: 6,
                border: '2px solid var(--accent)',
                background: checked ? 'var(--accent)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--on-accent, white)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {checked ? '✓' : ''}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{checkboxLabel}</span>
          </button>
        )}

        {error && <div className="auth-error">{error}</div>}

        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <button className="btn-secondary" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
