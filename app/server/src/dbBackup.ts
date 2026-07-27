import fs from 'fs/promises';
import path from 'path';
import { prisma } from './db.js';
import { log } from './log.js';

/** Where snapshots go. Defaults to a folder on the same persistent volume as
 *  the database — that protects against "I deleted the wrong thing" and bad
 *  migrations, but NOT against losing the volume itself. Point BACKUP_DIR at
 *  a mounted external store for real off-site safety. */
const BACKUP_DIR = process.env.BACKUP_DIR || '/data/backups';
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 14;

function dbFilePath(): string | null {
  // DATABASE_URL looks like "file:/data/dev.db" or "file:./dev.db".
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return null;
  const p = url.slice('file:'.length);
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), 'prisma', p);
}

/** Snapshots SQLite using its own VACUUM INTO, which produces a consistent
 *  copy even while the app is writing — a plain file copy can capture a torn
 *  page mid-transaction. */
export async function runDailyBackup(): Promise<string | null> {
  const src = dbFilePath();
  if (!src) {
    log.warn('backup ignorado: DATABASE_URL não é um arquivo SQLite');
    return null;
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dest = path.join(BACKUP_DIR, `rikari-${stamp}.db`);

  // VACUUM INTO refuses to overwrite, so a same-second rerun is a no-op rather
  // than a corrupted target.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
  const { size } = await fs.stat(dest);
  log.info({ dest, sizeKb: Math.round(size / 1024) }, 'backup do banco concluído');

  await pruneOldBackups();
  return dest;
}

async function pruneOldBackups() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(BACKUP_DIR).catch(() => [] as string[]);
  for (const name of entries) {
    if (!name.startsWith('rikari-') || !name.endsWith('.db')) continue;
    const full = path.join(BACKUP_DIR, name);
    const st = await fs.stat(full).catch(() => null);
    if (st && st.mtimeMs < cutoff) {
      await fs.unlink(full).catch(() => {});
      log.info({ file: name }, 'backup antigo removido');
    }
  }
}
