import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { qaPath } from './qa-paths.mjs';
mkdirSync('.local', { recursive: true });
const binary = resolve(
  '.local/tools/gitleaks',
  process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks',
);
const count = Number(process.env.GIT_CONFIG_COUNT ?? '0');
const result = spawnSync(
  binary,
  [
    'git',
    '--redact',
    '--no-banner',
    '--report-format',
    'json',
    '--report-path',
    '.local/gitleaks-redacted.json',
    '.',
  ],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: String(count + 1),
      [`GIT_CONFIG_KEY_${count}`]: 'safe.directory',
      [`GIT_CONFIG_VALUE_${count}`]: process.cwd().replaceAll('\\', '/'),
    },
  },
);
if (result.error || ![0, 1].includes(result.status))
  throw new Error('Gitleaks could not complete; run npm run security:install first');
const findings = JSON.parse(readFileSync('.local/gitleaks-redacted.json', 'utf8'));
const report = {
  executedAt: new Date().toISOString(),
  status: result.status === 0 ? 'PASS' : 'FAIL',
  scope: 'Complete fetched Git history, local scan only, Gitleaks 8.30.1 default rules',
  findings: findings.map((finding) => ({
    rule: finding.RuleID,
    file: finding.File,
    line: finding.StartLine,
    commit: finding.Commit,
  })),
};
writeFileSync(qaPath('evidence/gitleaks.json'), JSON.stringify(report, null, 2));
console.log(
  `${report.status}: local history scan, ${report.findings.length} findings. Secret values are never printed or uploaded.`,
);
process.exitCode = result.status;
