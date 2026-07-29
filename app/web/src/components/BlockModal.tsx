import { useState } from 'react';
import Modal from './Modal';
import { useCreateAgendaBlock } from '../api/hooks';
import { numOr0 } from '../format';

/** Blocks time on the Agenda without inventing a fake client — lunch, a
 *  doctor's visit, a whole vacation day. Blocked slots leave the
 *  "Horários disponíveis" list. */
export default function BlockModal({ onClose, defaultDate }: { onClose: () => void; defaultDate: string }) {
  const createBlock = useCreateAgendaBlock();
  const [date, setDate] = useState(defaultDate);
  const [allDay, setAllDay] = useState(false);
  const [time, setTime] = useState('12:00');
  const [durationMin, setDurationMin] = useState('60');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setError(null);
    if (!date) return setError('Escolha a data.');
    if (!allDay && !/^\d{2}:\d{2}$/.test(time)) return setError('Horário inválido — use o formato 12:30.');
    try {
      await createBlock.mutateAsync({
        date,
        allDay,
        time: allDay ? undefined : time,
        durationMin: allDay ? undefined : Math.max(5, Math.round(numOr0(durationMin)) || 60),
        motivo: motivo.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao bloquear');
    }
  }

  return (
    <Modal title="Bloquear horário" onClose={onClose}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Almoço, compromisso, folga — o horário some da lista de disponíveis, sem precisar inventar cliente.
      </div>
      <label className="field">
        Data
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button
        onClick={() => setAllDay((v) => !v)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)', alignSelf: 'flex-start' }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            flex: 'none',
            borderRadius: 6,
            border: '2px solid var(--accent)',
            background: allDay ? 'var(--accent)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {allDay ? '✓' : ''}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--text)' }}>Dia inteiro (folga, viagem, feriado)</span>
      </button>
      {!allDay && (
        <div className="field-row">
          <label className="field">
            A partir de
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            Duração (min)
            <input className="input" inputMode="numeric" placeholder="60" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
          </label>
        </div>
      )}
      <label className="field">
        Motivo (opcional)
        <input className="input" placeholder="Ex: almoço, dentista, curso" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={createBlock.isPending}>
          Bloquear
        </button>
      </div>
    </Modal>
  );
}
