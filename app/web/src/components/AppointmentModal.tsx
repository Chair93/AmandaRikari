import { useState } from 'react';
import Modal from './Modal';
import { useClients, useDeleteAppointment, useSaveAppointment, useServices } from '../api/hooks';
import type { Appointment } from '../api/types';
import { fmtBRL, numOr0 } from '../format';

export default function AppointmentModal({
  onClose,
  editingAppointment,
  defaultDate,
  defaultTime,
  defaultClientId,
  defaultServiceId,
  defaultServiceIds,
}: {
  onClose: () => void;
  editingAppointment?: Appointment | null;
  defaultDate?: string;
  defaultTime?: string;
  /** Pre-fill for the "já agendar o retorno?" flow after an atendimento. */
  defaultClientId?: string;
  defaultServiceId?: string;
  defaultServiceIds?: string[];
}) {
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useServices();
  const saveAppointment = useSaveAppointment();
  const deleteAppointment = useDeleteAppointment();

  const [clientId, setClientId] = useState(editingAppointment?.clientId || defaultClientId || '');
  // A visit can combine several procedures — services toggle on/off.
  const [serviceIds, setServiceIds] = useState<string[]>(() => {
    if (editingAppointment) {
      const fromList = editingAppointment.services?.map((s) => s.serviceId) || [];
      return fromList.length ? fromList : editingAppointment.serviceId ? [editingAppointment.serviceId] : [];
    }
    if (defaultServiceIds?.length) return defaultServiceIds;
    return defaultServiceId ? [defaultServiceId] : [];
  });
  const [date, setDate] = useState(editingAppointment?.date || defaultDate || '');
  const [time, setTime] = useState(editingAppointment?.time || defaultTime || '');
  const [durationMin, setDurationMin] = useState(String(editingAppointment?.durationMin || 60));
  const [note, setNote] = useState(editingAppointment?.note || '');
  const [error, setError] = useState<string | null>(null);

  const selecionados = services.filter((s) => serviceIds.includes(s.id));
  const totalPrevisto = selecionados.reduce((a, s) => a + numOr0(s.price), 0);

  function toggleService(id: string) {
    setServiceIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function onSave() {
    if (!clientId || !date || !time) {
      setError('Escolha o cliente, a data e o horário.');
      return;
    }
    try {
      await saveAppointment.mutateAsync({
        id: editingAppointment?.id,
        clientId,
        serviceIds,
        serviceId: serviceIds[0] || null,
        date,
        time,
        durationMin: Math.max(5, Math.round(numOr0(durationMin)) || 60),
        note: note || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  async function onDelete() {
    if (!editingAppointment) return;
    if (!window.confirm('Cancelar este agendamento?')) return;
    await deleteAppointment.mutateAsync(editingAppointment.id);
    onClose();
  }

  return (
    <Modal title={editingAppointment ? 'Editar agendamento' : 'Novo agendamento'} onClose={onClose}>
      <label className="field">
        Cliente
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Escolha</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        Serviços (toque pra marcar — pode mais de um)
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {services.map((s) => {
            const on = serviceIds.includes(s.id);
            return (
              <button key={s.id} className={'pill sm' + (on ? ' active' : '')} onClick={() => toggleService(s.id)}>
                {on ? '✓ ' : ''}
                {s.name}
              </button>
            );
          })}
        </div>
        {selecionados.length > 1 && (
          <span style={{ fontWeight: 500, fontSize: 11.5, color: 'var(--text-muted)' }}>
            {selecionados.length} serviços · total previsto {fmtBRL(totalPrevisto)}
          </span>
        )}
      </div>
      <div className="field-row">
        <label className="field">
          Data
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          Horário
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="field">
        Duração (minutos)
        <input className="input" inputMode="numeric" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} />
      </label>
      <label className="field">
        Nota (opcional)
        <input className="input" placeholder="Preferências, observações..." value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions">
        {editingAppointment && (
          <button className="btn-danger-text" onClick={onDelete}>
            Cancelar agendamento
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn-secondary" onClick={onClose}>
          Fechar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saveAppointment.isPending}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
