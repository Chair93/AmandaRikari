import 'dotenv/config';
import 'express-async-errors';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import cron from 'node-cron';
import { sendDailyDigests } from './digest.js';
import { runDailyBackup } from './dbBackup.js';
import { sendBackupEmails } from './emailBackup.js';
import { prisma } from './db.js';
import { log } from './log.js';
import { OwnershipError } from './ownership.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import authRoutes from './routes/auth.js';
import categoriesRoutes from './routes/categories.js';
import clientsRoutes from './routes/clients.js';
import productsRoutes from './routes/products.js';
import equipmentRoutes from './routes/equipment.js';
import servicesRoutes from './routes/services.js';
import transactionsRoutes from './routes/transactions.js';
import billsRoutes from './routes/bills.js';
import recurringRoutes from './routes/recurring.js';
import packagesRoutes from './routes/packages.js';
import settingsRoutes from './routes/settings.js';
import reportsRoutes from './routes/reports.js';
import backupRoutes from './routes/backup.js';
import teamRoutes from './routes/team.js';
import appointmentsRoutes from './routes/appointments.js';
import photosRoutes from './routes/photos.js';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Behind Fly's proxy: needed for correct client IPs (rate limiting) and for
// secure-cookie detection.
app.set('trust proxy', 1);

app.use(
  helmet({
    // The SPA is served from this same origin; allow its own assets plus the
    // Google Fonts and SheetJS CDN the frontend loads at runtime.
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdn.sheetjs.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'https://cdn.sheetjs.com'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(pinoHttp({ logger: log, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

/** Liveness + readiness: actually touches the DB, so Fly's health check fails
 *  when the volume or Prisma connection is broken instead of reporting green
 *  on a process that can't serve a single request. */
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (e) {
    log.error({ err: e }, 'health check failed');
    res.status(503).json({ ok: false, error: 'database_unavailable' });
  }
});

// Credential endpoints are the ones worth brute-forcing; everything else is
// already behind a session cookie.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente de novo em alguns minutos.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/recurring', recurringRoutes);
app.use('/api/packages', packagesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/photos', photosRoutes);

// Public one-tap confirmation: the WhatsApp reminder carries /c/<token>, the
// client taps it and the appointment is marked "confirmou" — no login, no
// WhatsApp API. The token is an unguessable cuid; the page shows only what
// the client already knows (their own booking).
const confirmLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false });
app.get('/c/:token', confirmLimiter, async (req, res) => {
  const token = String(req.params.token || '');
  const pagina = (titulo: string, corpo: string, emoji: string) =>
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title></head>` +
    `<body style="margin:0;font-family:Georgia,'Times New Roman',serif;background:#f7f0ec;color:#2a2220;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px">` +
    `<div style="max-width:420px;text-align:center;background:#fffdfb;border-radius:24px;padding:40px 32px;box-shadow:0 8px 40px rgb(90 60 50/.12)">` +
    `<div style="font-size:56px;margin-bottom:12px">${emoji}</div><h1 style="font-size:24px;margin:0 0 10px">${titulo}</h1>` +
    `<p style="font-size:16px;line-height:1.6;margin:0;color:#6b5d57">${corpo}</p></div></body></html>`;
  try {
    const ap = /^[a-z0-9]{10,40}$/.test(token)
      ? await prisma.appointment.findUnique({ where: { confirmToken: token }, include: { client: { select: { name: true } }, service: { select: { name: true } } } })
      : null;
    if (!ap || ap.status !== 'confirmed') {
      return res.status(404).send(pagina('Link não encontrado', 'Esse link de confirmação não existe mais. Fale direto com a gente pelo WhatsApp. 💗', '🌸'));
    }
    if (!ap.confirmou) await prisma.appointment.update({ where: { id: ap.id }, data: { confirmou: true } });
    const [y, m, d] = ap.date.split('-');
    const nome = ap.client.name.split(' ')[0];
    return res.send(
      pagina(
        'Presença confirmada!',
        `Obrigada, ${nome}! Te esperamos dia <strong>${d}/${m}/${y}</strong> às <strong>${ap.time}</strong>${ap.service ? ` para ${ap.service.name}` : ''}. Até lá! 💗`,
        '✅'
      )
    );
  } catch {
    return res.status(500).send(pagina('Ops', 'Algo deu errado por aqui. Tente de novo em instantes.', '🌧️'));
  }
});

// In production the built frontend (app/web/dist) is copied into ./public
// alongside this compiled server, so one process serves the API and the SPA.
if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof OwnershipError) return res.status(err.status).json({ error: err.message });
  if (err?.code === 'P2003') return res.status(400).json({ error: 'Referência inválida (registro relacionado não encontrado)' });
  if (err?.code === 'P2025') return res.status(404).json({ error: 'not_found' });
  log.error({ err, method: req.method, path: req.originalUrl }, 'unhandled error');
  res.status(err.status || 500).json({ error: 'internal_error' });
});

cron.schedule('0 8 * * *', () => {
  sendDailyDigests().catch((e) => log.error({ err: e }, 'falha ao enviar resumos diários'));
});

cron.schedule('30 3 * * *', () => {
  runDailyBackup().catch((e) => log.error({ err: e }, 'falha no backup automático'));
});

// 01:00 UTC = 22:00 em Brasília — fim do dia de trabalho. Só envia quando o
// conteúdo mudou desde o último backup que realmente saiu.
cron.schedule('0 1 * * *', () => {
  sendBackupEmails().catch((e) => log.error({ err: e }, 'falha no backup por e-mail'));
});

const PORT = Number(process.env.PORT) || 4000;
const server = app.listen(PORT, () => {
  log.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'Rikari API iniciada');
});

/** Fly sends SIGTERM on every deploy. Without this the process is killed
 *  mid-request, which with SQLite risks tearing a write. */
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'encerrando — aguardando requisições em andamento');
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      log.info('encerrada com segurança');
      process.exit(0);
    });
    // Don't hang forever if a connection refuses to drain.
    setTimeout(() => {
      log.warn('timeout no encerramento — forçando saída');
      process.exit(1);
    }, 10_000).unref();
  });
}

process.on('unhandledRejection', (reason) => log.error({ err: reason }, 'unhandled rejection'));
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'uncaught exception — encerrando');
  process.exit(1);
});
