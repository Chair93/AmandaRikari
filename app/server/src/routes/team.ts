import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireOwner, type AuthedRequest } from '../auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: AuthedRequest, res) => {
  const members = await prisma.membership.findMany({
    where: { businessId: req.businessId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(members.map((m) => ({ membershipId: m.id, userId: m.user.id, email: m.user.email, name: m.user.name, role: m.role, isYou: m.userId === req.userId })));
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
  role: z.enum(['owner', 'viewer']).default('viewer'),
});

/** Owner sets up a login for a teammate directly (no e-mail invite flow —
 *  simplest thing that works for a two-person shop: Amanda picks the
 *  e-mail/senha for her husband and shares it with him). */
router.post('/invite', requireOwner, async (req: AuthedRequest, res) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const { email, name, password, role } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existingUser) {
    const existingMembership = await prisma.membership.findFirst({ where: { userId: existingUser.id } });
    if (existingMembership) return res.status(409).json({ error: 'Esse e-mail já tem uma conta em outro negócio' });
    const membership = await prisma.membership.create({ data: { userId: existingUser.id, businessId: req.businessId!, role } });
    return res.status(201).json({ membershipId: membership.id, userId: existingUser.id, email: existingUser.email, name: existingUser.name, role });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email: email.toLowerCase(), passwordHash, name } });
  const membership = await prisma.membership.create({ data: { userId: user.id, businessId: req.businessId!, role } });
  res.status(201).json({ membershipId: membership.id, userId: user.id, email: user.email, name: user.name, role });
});

const roleSchema = z.object({ role: z.enum(['owner', 'viewer']) });

router.put('/:membershipId/role', requireOwner, async (req: AuthedRequest, res) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const membership = await prisma.membership.findFirst({ where: { id: req.params.membershipId, businessId: req.businessId } });
  if (!membership) return res.status(404).json({ error: 'not_found' });
  if (membership.userId === req.userId) return res.status(400).json({ error: 'Você não pode mudar seu próprio papel' });
  const updated = await prisma.membership.update({ where: { id: membership.id }, data: { role: parsed.data.role } });
  res.json({ membershipId: updated.id, role: updated.role });
});

router.delete('/:membershipId', requireOwner, async (req: AuthedRequest, res) => {
  const membership = await prisma.membership.findFirst({ where: { id: req.params.membershipId, businessId: req.businessId } });
  if (!membership) return res.status(404).json({ error: 'not_found' });
  if (membership.userId === req.userId) return res.status(400).json({ error: 'Você não pode se remover' });
  await prisma.membership.delete({ where: { id: membership.id } });
  res.status(204).end();
});

export default router;
