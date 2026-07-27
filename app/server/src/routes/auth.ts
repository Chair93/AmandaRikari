import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../db.js';
import { signToken, setAuthCookie, clearAuthCookie, requireAuth, type AuthedRequest } from '../auth.js';
import { sendMail, isMailerConfigured } from '../mailer.js';

const router = Router();

const DEFAULT_CATEGORIES = [
  { name: 'Insumos (cremes etc)', type: 'despesa', investment: false },
  { name: 'Descartáveis', type: 'despesa', investment: false },
  { name: 'Equipamentos', type: 'despesa', investment: true },
  { name: 'Transporte', type: 'despesa', investment: false },
  { name: 'Casa / Geral', type: 'despesa', investment: false },
  { name: 'Atendimento', type: 'receita', investment: false },
];

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
  name: z.string().min(1),
});

/** Public sign-up only creates the very first account (the clinic owner). After
 *  that, new teammates are added by the owner via Ajustes > Equipe, not by
 *  self-registering — this app is single-business, not a public SaaS. */
router.post('/register', async (req, res) => {
  const existingUserCount = await prisma.user.count();
  if (existingUserCount > 0) return res.status(403).json({ error: 'Cadastro fechado. Peça para quem administra o sistema te adicionar em Ajustes > Equipe.' });

  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'invalid_input' });
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) return res.status(409).json({ error: 'Já existe uma conta com este e-mail' });

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: email.toLowerCase(), passwordHash, name } });
    const business = await tx.business.create({
      data: {
        name: `Negócio de ${name}`,
        settings: { create: {} },
        categories: { create: DEFAULT_CATEGORIES },
        members: { create: { userId: u.id, role: 'owner' } },
      },
    });
    return { u, business };
  });

  const token = signToken(user.u.id);
  setAuthCookie(res, token);
  res.status(201).json({ id: user.u.id, email: user.u.email, name: user.u.name, role: 'owner', businessName: user.business.name });
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'E-mail ou senha incorretos' });

  const membership = await prisma.membership.findFirst({ where: { userId: user.id }, include: { business: true } });
  if (!membership) return res.status(401).json({ error: 'Esta conta não está vinculada a nenhum negócio' });

  const token = signToken(user.id);
  setAuthCookie(res, token);
  res.json({ id: user.id, email: user.email, name: user.name, role: membership.role, businessName: membership.business.name });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const [user, business] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.userId } }),
    prisma.business.findUnique({ where: { id: req.businessId } }),
  ]);
  if (!user || !business) return res.status(401).json({ error: 'not_authenticated' });
  res.json({ id: user.id, email: user.email, name: user.name, role: req.role, businessName: business.name });
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8, 'A nova senha precisa ter pelo menos 8 caracteres') });

router.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Senha atual incorreta' });
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.status(204).end();
});

const forgotSchema = z.object({ email: z.string().email() });
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

router.post('/forgot-password', async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  // Always respond the same way whether or not the e-mail exists, so this
  // endpoint can't be used to probe which e-mails have accounts.
  const genericOk = () => res.json({ ok: true });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return genericOk();

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
  });

  const resetUrl = `${process.env.CLIENT_ORIGIN || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
  if (isMailerConfigured()) {
    await sendMail({
      to: user.email,
      subject: 'Redefinir senha — Rikari',
      text: `Oi ${user.name}, clique no link para redefinir sua senha (válido por 1 hora): ${resetUrl}\n\nSe você não pediu isso, ignore este e-mail.`,
    });
  } else {
    // Dev fallback: no SMTP configured, so the link can't actually be
    // e-mailed — surface it in the server log instead of failing silently.
    console.log(`[auth] SMTP não configurado — link de redefinição de senha para ${user.email}: ${resetUrl}`);
  }
  genericOk();
});

const resetSchema = z.object({ token: z.string().min(1), newPassword: z.string().min(8, 'A nova senha precisa ter pelo menos 8 caracteres') });

router.post('/reset-password', async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Link inválido ou expirado. Peça um novo.' });
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  res.status(204).end();
});

export default router;
