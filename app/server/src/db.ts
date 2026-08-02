import { PrismaClient } from '@prisma/client';

// SQLite serializes writes, so a burst of atendimentos (or a slow disk on the
// small production VM) can hold an interactive transaction past Prisma's
// default 5s timeout and turn a normal save into a 500. Give real-world
// spikes room to breathe instead.
export const prisma = new PrismaClient({
  transactionOptions: { maxWait: 15000, timeout: 30000 },
});
