import { useState } from 'react';
import Modal from './Modal';
import { useClients, useDeleteAppointment, useSaveAppointment, useServices } from '../api/hooks';
import type { Appointment } from '../api/types';
import { numOr0 } from '../format';

export default function AppointmentModal({
  onClose,
  editingAppointment,
  defaultDate,
  defaultTime,
}: {
  onClose: () => void;
  editingAppointment?: Appointment | null;
  defaultDate?: string;
  defaultTime?: string;
}) {
  const { data: clients = [] } = useClients();
  const { data: services = [] } = useServices();
  const saveAppointment = useSaveAppointment();
  const deleteAppointment = useDeleteAppointment();

  const [clientId, setClientId] = useState(editingAppointment?.clientId || '');
  const [serviceId, setServiceId] = useState(editingAppointment?.serviceId || '');
  const [date, setDate] = useState(editingAppointment?.date || defaultDate || '');
  const [time, setTime] = useState(editingAppointment?.time || defaultTime || '');
  const [durationMin, setDurationMin] = useState(String(editingAppointment?.durationMin || 60));
  const [note, setNote] = useState(editingAppointment?.note || '');
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!clientId || !date || !time) {
      setError('Escolha o cliente, a data e o horário.');
      return;
    }
    try {
      await saveAppointment.mutateAsync({
        id: editingAppointment?.id,
        clientId,
        serviceId: serviceId || null,
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

  function onSelectService(id: string) {
    setServiceId(id);
    const svc = services.find((s) => s.id === id);
    // Best-effort default so the slot isn't obviously too short — the user can still edit it.
    if (svc && !editingAppointment) setDurationMin((d) => d || '60');
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
      <label className="field">
        Serviço (opcional)
        <select className="input" value={serviceId} onChange={(e) => onSelectService(e.target.value)}>
          <option value="">Nenhum / outro</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
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
