import { readFileSync, writeFileSync } from 'node:fs';
const source = process.argv[2];
if (source !== '.local/academy-db.log') throw new Error('Unapproved QA log');
const log = readFileSync(source, 'utf8');
const checks = [...log.matchAll(/^PASS ([A-Za-z0-9 :/,()._-]{1,180})\r?$/gm)].map(
  (match) => match[1],
);
const codes = [
  ...new Set(
    [...log.matchAll(/(?:code|error_code): ['"]([A-Za-z0-9_]{1,70})['"]/g)].map(
      (match) => match[1],
    ),
  ),
];
const locations = [
  ...new Set(
    [...log.matchAll(/test-academy-operations\.ts:(\d+):(\d+)/g)].map(
      (match) => `${match[1]}:${match[2]}`,
    ),
  ),
];
const result = {
  status: 'FAIL',
  command: 'npm run test:academy',
  passedChecks: checks,
  errorCodes: codes,
  sourceLocations: locations,
  rawLog: 'Excluded: may contain private auth data',
};
writeFileSync('.local/academy-command-summary.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
