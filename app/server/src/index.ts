import 'dotenv/config';
import 'express-async-errors';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';
import { sendDailyDigests } from './digest.js';

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

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

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
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.code === 'P2003') return res.status(400).json({ error: 'Referência inválida (registro relacionado não encontrado)' });
  if (err?.code === 'P2025') return res.status(404).json({ error: 'not_found' });
  console.error(err);
  res.status(err.status || 500).json({ error: 'internal_error' });
});

cron.schedule('0 8 * * *', () => {
  sendDailyDigests().catch((e) => console.error('Falha ao enviar resumos diários:', e));
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`Rikari API listening on http://localhost:${PORT}`);
});
