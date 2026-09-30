import { readiness } from '@/lib/server/readiness';
// Keep the original DB-aware health contract for existing deployment probes.
export const GET = readiness;
