import { useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { useAppointmentsRange, useClientesReport, useDayAgenda, useDeleteAgendaBlock, useDeleteAppointment, useSettings, useToggleAppointmentConfirmou } from '../api/hooks';
import ClientDetailModal from '../components/ClientDetailModal';
import { useAuth } from '../auth/AuthContext';
import { todayStr } from '../format';
import { comLinkConfirmacao, fillNome, fillWaTemplate, waLink, WA_REATIVACAO_PADRAO } from '../waTemplate';
import AppointmentModal from '../components/AppointmentModal';
import BlockModal from '../components/BlockModal';
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
function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
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
  const [modal, setModal] = useState<{ editing?: Appointment; defaultTime?: string; defaultDate?: string; defaultClientId?: string; defaultServiceId?: string; defaultServiceIds?: string[] } | null>(null);
  const [atender, setAtender] = useState<Appointment | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [blockModal, setBlockModal] = useState(false);
  const toggleConfirmou = useToggleAppointmentConfirmou();
  const deleteBlock = useDeleteAgendaBlock();
  const deleteAppointment = useDeleteAppointment();
  const { data: clientesData } = useClientesReport();
  const { data: settings } = useSettings();

  // Week strip or full month grid — Amanda flips between "esta semana" and
  // "como está agosto?". The choice sticks across visits.
  const [view, setViewState] = useState<'semana' | 'mes'>(() => (localStorage.getItem('rikari.agendaView') === 'mes' ? 'mes' : 'semana'));
  function setView(v: 'semana' | 'mes') {
    setViewState(v);
    localStorage.setItem('rikari.agendaView', v);
  }

  const weekStart = startOfWeek(selectedDate);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  // Month grid: from the Sunday before the 1st to the Saturday after the
  // last day, so the calendar is always full rows.
  const monthKey = selectedDate.slice(0, 7);
  const gridDays = useMemo(() => {
    const [y, m] = monthKey.split('-').map(Number);
    const first = `${monthKey}-01`;
    const last = `${monthKey}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const start = startOfWeek(first);
    const end = addDays(startOfWeek(last), 6);
    const days: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  }, [monthKey]);
  const rangeFrom = view === 'mes' ? gridDays[0] : weekDays[0];
  const rangeTo = view === 'mes' ? gridDays[gridDays.length - 1] : weekDays[6];
  const { data: rangeAppointments = [] } = useAppointmentsRange(rangeFrom, rangeTo);
  const { data: dayAgenda } = useDayAgenda(selectedDate);

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    rangeAppointments.forEach((a) => m.set(a.date, (m.get(a.date) || 0) + 1));
    return m;
  }, [rangeAppointments]);

  const today = todayStr();
  const appointments = dayAgenda?.appointments || [];
  const blocks = dayAgenda?.blocks || [];
  const availableSlots = dayAgenda?.availableSlots || [];

  /** All booked procedures joined for display ("Limpeza + Peeling"). */
  function svcNames(a: Appointment): string | null {
    if (a.services?.length) return a.services.map((x) => x.service.name).join(' + ');
    return a.service?.name || null;
  }
  function svcIds(a: Appointment): string[] {
    if (a.services?.length) return a.services.map((x) => x.serviceId);
    return a.serviceId ? [a.serviceId] : [];
  }

  function whatsAppReminder(a: Appointment) {
    const fone = (a.client.phone || '').replace(/\D/g, '');
    if (!fone) return null;
    const numero = fone.length <= 11 ? '55' + fone : fone;
    const msg = comLinkConfirmacao(
      fillWaTemplate(settings?.waTemplate || '', {
        clientName: a.client.name,
        date: a.date,
        time: a.time,
        serviceName: svcNames(a),
      }),
      a.confirmToken
    );
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
            <button
              className="icon-btn"
              aria-label={view === 'mes' ? 'Mês anterior' : 'Semana anterior'}
              onClick={() => setSelectedDate((d) => (view === 'mes' ? addMonths(d, -1) : addDays(d, -7)))}
            >
              <IconChevronLeft />
            </button>
            <span className="serif" style={{ fontSize: 15, fontWeight: 600, textTransform: 'capitalize', minWidth: 130 }}>
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              className="icon-btn"
              aria-label={view === 'mes' ? 'Próximo mês' : 'Próxima semana'}
              onClick={() => setSelectedDate((d) => (view === 'mes' ? addMonths(d, 1) : addDays(d, 7)))}
            >
              <IconChevronRight />
            </button>
            <button className="pill sm" onClick={() => setSelectedDate(today)}>
              Hoje
            </button>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className={'pill sm' + (view === 'semana' ? ' active' : '')} onClick={() => setView('semana')}>
                Semana
              </button>
              <button className={'pill sm' + (view === 'mes' ? ' active' : '')} onClick={() => setView('mes')}>
                Mês
              </button>
            </div>
          </div>

          {view === 'semana' ? (
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
                      color: isSelected ? 'var(--on-accent, white)' : 'var(--text)',
                      border: isToday && !isSelected ? '1.5px solid var(--accent-text)' : undefined,
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
                          color: isSelected ? 'var(--on-accent, white)' : 'var(--accent-text, var(--income-text))',
                        }}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {WEEKDAY_SHORT.map((w) => (
                  <div key={w} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '2px 0' }}>
                    {w}
                  </div>
                ))}
                {gridDays.map((d) => {
                  const count = countByDate.get(d) || 0;
                  const isSelected = d === selectedDate;
                  const isToday = d === today;
                  const foraDoMes = d.slice(0, 7) !== monthKey;
                  return (
                    <button
                      key={d}
                      onClick={() => setSelectedDate(d)}
                      style={{
                        all: 'unset',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        minHeight: 46,
                        borderRadius: 10,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        padding: '4px 0',
                        background: isSelected ? 'var(--accent)' : 'transparent',
                        color: isSelected ? 'var(--on-accent, white)' : foraDoMes ? 'var(--text-soft, var(--text-muted))' : 'var(--text)',
                        opacity: foraDoMes && !isSelected ? 0.45 : 1,
                        border: isToday && !isSelected ? '1.5px solid var(--accent-text)' : '1.5px solid transparent',
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: isSelected || isToday ? 700 : 500 }}>{Number(d.slice(8, 10))}</span>
                      {count > 0 ? (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            padding: '0 5px',
                            borderRadius: 999,
                            background: isSelected ? 'rgba(255,255,255,0.28)' : 'var(--accent-soft)',
                            color: isSelected ? 'var(--on-accent, white)' : 'var(--accent-text)',
                          }}
                        >
                          {count}
                        </span>
                      ) : (
                        <span style={{ height: 13 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 2, minWidth: 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div className="serif" style={{ fontSize: 17, fontWeight: 600, textTransform: 'capitalize' }}>
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                    </div>
                    {(() => {
                      // What the booked day is worth: registered atendimentos by
                      // their real value, the rest by the services' list price.
                      const previsto = appointments.reduce((acc, a) => {
                        if (a.tx) return acc + a.tx.amount;
                        const svcs = a.services?.length ? a.services.map((x) => x.service.price) : [];
                        return acc + svcs.reduce((s, v) => s + (v || 0), 0);
                      }, 0);
                      return appointments.length > 0 ? (
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>
                          {appointments.length} atendimento{appointments.length === 1 ? '' : 's'}
                          {previsto > 0 && <> · previsto {fmtBRL(previsto)}</>}
                        </div>
                      ) : null;
                    })()}
                  </div>
                  {isOwner && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="pill ghost sm" onClick={() => setBlockModal(true)}>
                        🔒 Bloquear
                      </button>
                      <button className="pill accent sm" onClick={() => setModal({})}>
                        + Agendamento
                      </button>
                    </div>
                  )}
                </div>

                {blocks.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {blocks.map((b) => (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--surface-2)', borderRadius: 12, fontSize: 12.5 }}>
                        <span>🔒</span>
                        <span style={{ fontWeight: 600, flex: 'none' }}>{b.allDay ? 'Dia inteiro' : `${b.time} até ${endMin(b.time, b.durationMin)}`}</span>
                        <span style={{ color: 'var(--text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.motivo || 'bloqueado'}</span>
                        {isOwner && (
                          <button className="icon-btn" aria-label="Remover bloqueio" onClick={() => deleteBlock.mutate(b.id)}>
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

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
                            <button
                              style={{ all: 'unset', cursor: 'pointer', fontSize: 13, fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'var(--border-strong)', textUnderlineOffset: 3 }}
                              onClick={() => setDetailId(a.clientId)}
                              title="Abrir ficha do cliente"
                            >
                              {a.client.name}
                            </button>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{svcNames(a) || 'Atendimento'}{a.note ? ` · ${a.note}` : ''}</div>
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
                            {!a.tx && isOwner && (
                              <button
                                className={'pill ghost sm' + (a.confirmou ? ' active' : '')}
                                title="Cliente respondeu confirmando presença?"
                                onClick={() => toggleConfirmou.mutate(a.id)}
                              >
                                {a.confirmou ? '✓ confirmou' : 'confirmou?'}
                              </button>
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
                      const zapHref = waLink(c.phone, fillNome(settings?.waReactivation || '', WA_REATIVACAO_PADRAO, c.name));
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
      {modal && (
        <AppointmentModal
          onClose={() => setModal(null)}
          editingAppointment={modal.editing}
          defaultDate={modal.defaultDate ?? selectedDate}
          defaultTime={modal.defaultTime}
          defaultClientId={modal.defaultClientId}
          defaultServiceId={modal.defaultServiceId}
          defaultServiceIds={modal.defaultServiceIds}
        />
      )}
      {atender && (
        <TransactionModal
          onClose={() => setAtender(null)}
          defaultType="receita"
          lockType
          defaultClientId={atender.clientId}
          defaultServiceIds={svcIds(atender)}
          defaultDate={atender.date}
          appointmentId={atender.id}
          onSaved={() => {
            const a = atender;
            // Ask after the tx modal is gone; auto-opening without asking
            // would feel pushy when the client isn't rebooking.
            setTimeout(() => {
              if (a && window.confirm('Atendimento registrado! Já quer deixar o retorno agendado?')) {
                setModal({ defaultClientId: a.clientId, defaultServiceIds: svcIds(a), defaultDate: addDays(a.date, 28), defaultTime: a.time });
              }
            }, 150);
          }}
        />
      )}
      {detailId && <ClientDetailModal clientId={detailId} onClose={() => setDetailId(null)} />}
      {blockModal && <BlockModal onClose={() => setBlockModal(false)} defaultDate={selectedDate} />}
    </>
  );
}
