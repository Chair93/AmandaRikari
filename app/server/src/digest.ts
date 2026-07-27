import { prisma } from './db.js';
import { loadAll, buildAlerts } from './routes/reports.js';
import { ensureRecurringGenerated } from './routes/recurring.js';
import { isMailerConfigured, sendMail } from './mailer.js';

/** Runs once a day: for every business that opted in (Settings.emailDigestEnabled),
 *  mail its owner(s) a plain-text summary of what needs attention today —
 *  overdue/upcoming bills, low stock, clients who haven't come back in a while. */
export async function sendDailyDigests(): Promise<void> {
  if (!isMailerConfigured()) return;

  const businesses = await prisma.business.findMany({
    where: { settings: { emailDigestEnabled: true } },
    include: { members: { where: { role: 'owner' }, include: { user: true } } },
  });

  for (const business of businesses) {
    try {
      await ensureRecurringGenerated(business.id);
      const data = await loadAll(business.id);
      const alerts = buildAlerts(data);
      if (alerts.length === 0) continue;

      const lines = [
        `Resumo do dia — ${business.name}`,
        '',
        ...alerts.map((a) => `• ${a.text}`),
        '',
        'Esse é um resumo automático. Você pode desativar em Ajustes > Resumo diário por e-mail.',
      ];
      const text = lines.join('\n');

      for (const m of business.members) {
        if (!m.user?.email) continue;
        await sendMail({ to: m.user.email, subject: `Rikari — resumo do dia (${alerts.length} pendência${alerts.length === 1 ? '' : 's'})`, text });
      }
    } catch (e) {
      console.error(`Falha ao gerar resumo diário do negócio ${business.id}:`, e);
    }
  }
}
