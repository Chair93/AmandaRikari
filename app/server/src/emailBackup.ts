import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from './db.js';
import { isMailerConfigured, sendMail } from './mailer.js';
import { exportBusiness } from './routes/backup.js';
import { log } from './log.js';

const STATE_FILE = () => path.join(process.env.BACKUP_DIR || '/data/backups', 'email-backup-state.json');

/** Stable fingerprint of a backup's contents. exportedAt changes on every
 *  call, so it is stripped — otherwise "did anything change?" would always
 *  answer yes and the whole only-when-changed promise would be a lie. */
export function backupFingerprint(data: Record<string, unknown>): string {
  const { exportedAt: _ignored, ...rest } = data as { exportedAt?: string };
  return crypto.createHash('sha256').update(JSON.stringify(rest)).digest('hex');
}

function readState(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state: Record<string, string>): void {
  fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
  fs.writeFileSync(STATE_FILE(), JSON.stringify(state));
}

/** End-of-day backup by e-mail, per business, only when something changed
 *  since the last one that was actually sent. The fingerprint is only stored
 *  after a successful send, so a failed delivery retries the next night
 *  instead of being silently counted as done. */
export async function sendBackupEmails(): Promise<void> {
  if (!isMailerConfigured()) {
    log.info('backup por e-mail pulado: SMTP não configurado');
    return;
  }

  const businesses = await prisma.business.findMany({
    where: { settings: { emailBackupEnabled: true } },
    include: { members: { where: { role: 'owner' }, include: { user: true } } },
  });

  const state = readState();
  const today = new Date().toISOString().slice(0, 10);

  for (const business of businesses) {
    try {
      const data = await exportBusiness(business.id);
      const fingerprint = backupFingerprint(data as unknown as Record<string, unknown>);
      if (state[business.id] === fingerprint) {
        log.info({ business: business.id }, 'backup por e-mail pulado: nada mudou desde o último envio');
        continue;
      }

      const json = JSON.stringify(data, null, 2);
      const resumo = [
        `Backup do Rikari — ${business.name} — ${today}`,
        '',
        `Lançamentos: ${data.transactions.length}`,
        `Clientes: ${data.clients.length}`,
        `Agendamentos: ${data.appointments.length}`,
        `Contas: ${data.bills.length}`,
        `Produtos: ${data.products.length} · Bens: ${data.equipment.length} · Serviços: ${data.services.length}`,
        '',
        'O arquivo anexo restaura tudo em Ajustes > Restaurar backup.',
        'Este e-mail só chega quando algo mudou desde o último backup enviado.',
      ].join('\n');

      const recipients = business.members.map((m) => m.user?.email).filter((e): e is string => !!e);
      if (recipients.length === 0) continue;

      let delivered = false;
      for (const to of recipients) {
        try {
          await sendMail({
            to,
            subject: `Rikari — backup de ${today}`,
            text: resumo,
            attachments: [{ filename: `rikari-backup-${today}.json`, content: json, contentType: 'application/json' }],
          });
          delivered = true;
        } catch (e) {
          log.error({ err: e, to }, 'falha ao enviar backup por e-mail');
        }
      }

      if (delivered) {
        state[business.id] = fingerprint;
        writeState(state);
        log.info({ business: business.id }, 'backup por e-mail enviado');
      }
    } catch (e) {
      log.error({ err: e, business: business.id }, 'falha ao montar backup por e-mail');
    }
  }
}
