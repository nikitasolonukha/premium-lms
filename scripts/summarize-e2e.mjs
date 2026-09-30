import { qaPath } from './qa-paths.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2] ?? '.local/e2e-results.json', 'utf8'));
const target = qaPath('evidence/e2e-summary.json');
const prior = existsSync(target)
  ? JSON.parse(readFileSync(target, 'utf8'))
  : { runs: [], checks: [] };
const checks = [];
function visit(suites) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? [])
      for (const test of spec.tests ?? []) {
        const result = test.results.at(-1);
        checks.push({
          title: spec.title,
          file: spec.file,
          status: result?.status === 'passed' ? 'PASS' : result?.status === 'skipped' ? 'UNVERIFIED' : 'FAIL',
          durationMs: result?.duration,
          executedAt: result?.startTime,
          detail: result?.status === 'skipped' ? 'SKIP_EXTERNAL_CONFIGURATION' : result?.error ? 'Scenario failed; inspect sanitized diagnostics' : undefined,
        });
      }
    visit(suite.suites ?? []);
  }
}
visit(report.suites);
// A complete run replaces the current scenario inventory, so renamed/removed
// tests do not remain as apparently active checks. Run history is preserved.
const latest = new Map(
  process.argv.includes('--full') ? [] : prior.checks.map((c) => [c.title, c]),
);
for (const check of checks) latest.set(check.title, check);
const result = {
  updatedAt: new Date().toISOString(),
  note: 'Latest observed result per named scenario; run history preserves prior failures. External video details are in video-providers.json and remain a release gate. Local rate counters are isolated between browser scenarios; enforcement is tested within dedicated rate scenarios.',
  runs: [
    ...prior.runs,
    {
      startTime: report.stats.startTime,
      expected: report.stats.expected,
      unexpected: report.stats.unexpected,
      skipped: report.stats.skipped,
      durationMs: report.stats.duration,
    },
  ],
  checks: [...latest.values()],
};
writeFileSync(target, JSON.stringify(result, null, 2));
console.log(
  `${checks.filter((c) => c.status === 'PASS').length}/${checks.length} passed in this run; sanitized summary updated.`,
);
