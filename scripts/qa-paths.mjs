import { mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

// Set once in Playwright config / pipeline; child workers inherit the same run.
const runId =
  process.env.QA_RUN_ID ??
  `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/.test(runId)) throw new Error('Invalid QA_RUN_ID');
process.env.QA_RUN_ID = runId;
export const qaRoot = `docs/qa/runs/${runId}`;
/** @param {string} relativePath */
export function qaPath(relativePath) {
  if (
    !relativePath ||
    relativePath.startsWith('/') ||
    relativePath.includes('..') ||
    /[\\:\x00-\x1f]/.test(relativePath)
  )
    throw new Error('Invalid relative QA path');
  const path = `${qaRoot}/${relativePath}`;
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
