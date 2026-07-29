import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useAppointmentsRange, useClientesReport, useDayAgenda, useDeleteAppointment, useSettings } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { todayStr } from '../format';
import { fillWaTemplate } from '../waTemplate';
import AppointmentModal from '../components/AppointmentModal';
import TransactionModal from '../components/TransactionModal';
import { fmtBRL } from '../format';
import type { Appointment } from '../api/types';
import { IconChevronLeft, IconChevronRight } from '../icons';

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function startOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return addDays(iso, -d.getDay());
}
function endMin(time: string, durationMin: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + durationMin;
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

export default function Agenda() {
  const { isOwner } = useAuth();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [modal, setModal] = useState<{ editing?: Appointment; defaultTime?: string } | null>(null);
  const [atender, setAtender] = useState<Appointment | null>(null);
  const deleteAppointment = useDeleteAppointment();
  const { data: clientesData } = useClientesReport();
  const { data: settings } = useSettings();

  const weekStart = startOfWeek(selectedDate);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const { data: weekAppointments = [] } = useAppointmentsRange(weekDays[0], weekDays[6]);
  const { data: dayAgenda } = useDayAgenda(selectedDate);

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    weekAppointments.forEach((a) => m.set(a.date, (m.get(a.date) || 0) + 1));
    return m;
  }, [weekAppointments]);

  const today = todayStr();
  const appointments = dayAgenda?.appointments || [];
  const availableSlots = dayAgenda?.availableSlots || [];

  function whatsAppReminder(a: Appointment) {
    const fone = (a.client.phone || '').replace(/\D/g, '');
    if (!fone) return null;
    const numero = fone.length <= 11 ? '55' + fone : fone;
    const msg = fillWaTemplate(settings?.waTemplate || '', {
      clientName: a.client.name,
      date: a.date,
      time: a.time,
      serviceName: a.service?.name || null,
    });
    return `https://api.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(msg)}`;
  }

  async function onCancel(a: Appointment) {
    if (!window.confirm('Cancelar este agendamento?')) return;
    await deleteAppointment.mutateAsync(a.id);
  }

  return (
    <>
      <PageHeader title="Agenda" subtitle="Calendário de atendimentos, horários disponíveis e lembretes" />
      <div className="scroll-area">
        <div className="page wide">
          {/* Wraps so "Hoje" drops to its own line on a phone instead of being
              pushed off the right edge by the seven day cells. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', rowGap: 8 }}>
            <button className="icon-btn" aria-label="Semana anterior" onClick={() => setSelectedDate((d) => addDays(d, -7))}>
              <IconChevronLeft />
            </button>
            <div className="agenda-week">
              {weekDays.map((d) => {
                const count = countByDate.get(d) || 0;
                const isSelected = d === selectedDate;
                const isToday = d === today;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDate(d)}
                    className="card"
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      padding: '10px 4px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--accent)' : 'var(--surface)',
                      color: isSelected ? 'white' : 'var(--text)',
                      border: isToday && !isSelected ? '1.5px solid var(--accent)' : undefined,
                    }}
                  >
                    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', opacity: 0.75 }}>{WEEKDAY_SHORT[new Date(d + 'T00:00:00').getDay()]}</span>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{Number(d.slice(8, 10))}</span>
                    {count > 0 && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 999,
                          background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--accent-soft, var(--income-soft))',
                          color: isSelected ? 'white' : 'var(--accent-text, var(--income-text))',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button className="icon-btn" aria-label="Próxima semana" onClick={() => setSelectedDate((d) => addDays(d, 7))}>
              <IconChevronRight />
            </button>
            <button className="pill sm" onClick={() => setSelectedDate(today)}>
              Hoje
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 2, minWidth: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div className="serif" style={{ fontSize: 17, fontWeight: 600, textTransform: 'capitalize' }}>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </div>
                  {isOwner && (
                    <button className="pill accent sm" onClick={() => setModal({})}>
                      + Agendamento
                    </button>
                  )}
                </div>

                {appointments.length > 0 ? (
                  <div className="list">
                    {appointments.map((a) => {
                      const zap = whatsAppReminder(a);
                      return (
                        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface)', flexWrap: 'wrap', rowGap: 8 }}>
                          <div style={{ width: 80, flex: 'none' }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{a.time}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>até {endMin(a.time, a.durationMin)}</div>
                          </div>
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{a.client.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{a.service?.name || 'Atendimento'}{a.note ? ` · ${a.note}` : ''}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {a.tx ? (
                              <span className="badge" style={{ background: 'var(--income-soft)', color: 'var(--income-text)', fontWeight: 700 }}>
                                ✓ atendido · {fmtBRL(a.tx.amount)}
                              </span>
                            ) : (
                              isOwner &&
                              a.date <= today && (
                                <button className="pill sm accent" onClick={() => setAtender(a)}>
                                  Registrar atendimento
                                </button>
                              )
                            )}
                            {zap && !a.tx && (
                              <a className="pill sm" style={{ textDecoration: 'none', background: 'var(--income-soft)', color: 'var(--income-text)' }} href={zap} target="_blank" rel="noopener noreferrer">
                                Lembrete WhatsApp
                              </a>
                            )}
                            {isOwner && (
                              <>
                                <button className="pill ghost sm" onClick={() => setModal({ editing: a })}>
                                  editar
                                </button>
                                <button className="icon-btn" aria-label="Cancelar agendamento" onClick={() => onCancel(a)}>
                                  ×
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state">Nenhum agendamento neste dia.</div>
                )}
              </div>

              {isOwner && (
                <div className="card">
                  <div className="serif" style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                    Horários disponíveis
                  </div>
                  {availableSlots.length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {availableSlots.map((t) => (
                        <button key={t} className="pill sm" onClick={() => setModal({ defaultTime: t })}>
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Sem horários livres neste dia (ou fora do expediente configurado em Ajustes).</div>
                  )}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              {clientesData && clientesData.inativosList.length > 0 && (
                <div className="card">
                  <div className="serif" style={{ fontSize: 15, fontWeight: 600 }}>
                    Clientes em atraso
                  </div>
                  <div className="section-hint" style={{ marginBottom: 10 }}>Quem não aparece há mais de 45 dias.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--surface-2)', borderRadius: 14, overflow: 'hidden' }}>
                    {clientesData.inativosList.map((c) => {
                      const hasZap = !!(c.phone && c.phone.replace(/\D/g, '').length >= 10);
                      const zapHref = `https://wa.me/55${(c.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Oi, ${c.name.split(' ')[0]}! Passando pra saber se você quer agendar sua próxima visita 💗`)}`;
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface)' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{c.diasDesde} dias sem vir</div>
                          </div>
                          {hasZap && (
                            <a href={zapHref} target="_blank" rel="noopener noreferrer" className="pill sm income" style={{ textDecoration: 'none' }}>
                              Chamar
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {modal && <AppointmentModal onClose={() => setModal(null)} editingAppointment={modal.editing} defaultDate={selectedDate} defaultTime={modal.defaultTime} />}
      {atender && (
        <TransactionModal
          onClose={() => setAtender(null)}
          defaultType="receita"
          lockType
          defaultClientId={atender.clientId}
          defaultServiceId={atender.serviceId || undefined}
          defaultDate={atender.date}
          appointmentId={atender.id}
        />
      )}
    </>
  );
}
