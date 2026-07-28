import { fmtDateBR } from './format';

/** The Agenda's WhatsApp reminder. Editable in Ajustes; {nome}, {data},
 *  {hora} and {servico} are filled from the appointment at send time. */
export const WA_TEMPLATE_PADRAO =
  'Oi, {nome}! Passando para confirmar seu horário de {servico} no dia {data} às {hora}. Até lá! 💗';

export function fillWaTemplate(
  template: string,
  a: { clientName: string; date: string; time: string; serviceName: string | null }
): string {
  const base = template.trim() || WA_TEMPLATE_PADRAO;
  return base
    .replaceAll('{nome}', a.clientName.split(' ')[0])
    .replaceAll('{data}', fmtDateBR(a.date))
    .replaceAll('{hora}', a.time)
    .replaceAll('{servico}', a.serviceName || 'seu atendimento');
}
