import { test as base } from '@playwright/test';
import pg from 'pg';
export { expect } from '@playwright/test';
export type { Page, APIRequestContext } from '@playwright/test';
process.loadEnvFile('.env.local');
// Independent scenarios reuse seed identities. Reset only local rate counters,
// never the enforcement itself; the rate-limit scenario exercises real limits.
export const test = base.extend<{ rateIsolation: void }>({
  rateIsolation: [
    async ({}, use) => {
      const url = new URL(process.env.DATABASE_URL!);
      if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '56322')
        throw new Error('E2E isolation is restricted to the local QA database');
      const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
      await db.connect();
      try {
        await db.query('delete from private.rate_limits');
      } finally {
        await db.end();
      }
      await use();
    },
    { auto: true },
  ],
});
