import { fmtDateBR } from './format';

/** The Agenda's WhatsApp reminder. Editable in Ajustes; {nome}, {data},
 *  {hora} and {servico} are filled from the appointment at send time. */
export const WA_TEMPLATE_PADRAO =
  'Oi, {nome}! Passando para confirmar seu horário de {servico} no dia {data} às {hora}. Até lá! 💗';

export const WA_NIVER_PADRAO = 'Oi, {nome}! Feliz aniversário! 🎂✨ Que seu dia seja tão especial quanto você. Um beijo!';

export const WA_REATIVACAO_PADRAO = 'Oi, {nome}! Passando pra saber se você quer agendar sua próxima visita 💗';

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

/** Simpler messages (birthday, win-back) only carry the client's name. */
export function fillNome(template: string, fallback: string, clientName: string): string {
  return (template.trim() || fallback).replaceAll('{nome}', clientName.split(' ')[0]);
}

/** wa.me link for a Brazilian phone with a prefilled message. */
export function waLink(phone: string | null | undefined, text: string): string {
  const fone = (phone || '').replace(/\D/g, '');
  const numero = fone ? (fone.length <= 11 ? '55' + fone : fone) : '';
  return `https://api.whatsapp.com/send?${numero ? `phone=${numero}&` : ''}text=${encodeURIComponent(text)}`;
}
