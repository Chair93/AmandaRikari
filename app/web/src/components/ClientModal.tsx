import { useState } from 'react';
import Modal from './Modal';
import { useClients, useSaveClient } from '../api/hooks';
import type { Client } from '../api/types';

function maskBirthday(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length > 4) return d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
  if (d.length > 2) return d.slice(0, 2) + '/' + d.slice(2);
  return d;
}
function birthdayToIso(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
function isoToBirthday(iso: string | null): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default function ClientModal({ onClose, editingClient }: { onClose: () => void; editingClient?: Client | null }) {
  const saveClient = useSaveClient();
  const { data: clients = [] } = useClients();
  const [name, setName] = useState(editingClient?.name || '');
  const [phone, setPhone] = useState(editingClient?.phone || '');
  const [birthday, setBirthday] = useState(isoToBirthday(editingClient?.birthday || null));
  const [notes, setNotes] = useState(editingClient?.notes || '');
  const [indicadoPorId, setIndicadoPorId] = useState(editingClient?.indicadoPorId || '');
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    if (!name.trim()) {
      setError('Informe o nome.');
      return;
    }
    try {
      await saveClient.mutateAsync({
        id: editingClient?.id,
        name: name.trim(),
        phone: phone.trim() || null,
        birthday: birthdayToIso(birthday),
        notes: notes.trim() || null,
        indicadoPorId: indicadoPorId || null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  }

  return (
    <Modal title={editingClient ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <label className="field">
        Nome
        <input className="input" placeholder="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        Telefone (opcional)
        <input className="input" type="tel" placeholder="(00) 00000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </label>
      <label className="field">
        Aniversário (opcional)
        <input className="input" inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} value={birthday} onChange={(e) => setBirthday(maskBirthday(e.target.value))} />
      </label>
      <label className="field">
        Quem indicou (opcional)
        <select className="input" value={indicadoPorId} onChange={(e) => setIndicadoPorId(e.target.value)}>
          <option value="">Ninguém / não sei</option>
          {clients
            .filter((c) => c.id !== editingClient?.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label className="field">
        Observações (opcional)
        <input className="input" placeholder="Preferências, alergias, etc." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && <div className="auth-error">{error}</div>}
      <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onSave} disabled={saveClient.isPending}>
          Salvar
        </button>
      </div>
    </Modal>
  );
}
