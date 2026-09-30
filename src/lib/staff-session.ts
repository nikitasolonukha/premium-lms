import { z } from 'zod';
export const staffSessionSchema = z.object({
  serverTime: z.iso.datetime({ offset: true }),
  idleExpiresAt: z.iso.datetime({ offset: true }),
  absoluteExpiresAt: z.iso.datetime({ offset: true }),
});
export type StaffSession = z.infer<typeof staffSessionSchema>;
