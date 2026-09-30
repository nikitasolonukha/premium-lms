import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { safePlaywrightReport, safeServerLog, safeVideoReport } from './lib/safe-artifacts';
import { qaRoot } from './qa-paths.mjs';
const target = '.local/ci-artifacts';
mkdirSync(target, { recursive: true });
if (existsSync('.local/academy-command-summary.json'))
  copyFileSync('.local/academy-command-summary.json', `${target}/academy-command-summary.json`);
const report = existsSync('.local/e2e-results.json')
  ? safePlaywrightReport(JSON.parse(readFileSync('.local/e2e-results.json', 'utf8')))
  : { tests: [], note: 'UNVERIFIED: E2E report not produced' };
writeFileSync(`${target}/playwright-summary.json`, JSON.stringify(report, null, 2));
const html = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
writeFileSync(
  `${target}/playwright-report.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Sanitized Playwright results</title><h1>Playwright results</h1><p>Raw errors, attachments, credentials and traces are deliberately excluded. A skipped scenario is UNVERIFIED.</p><table><tr><th>Test</th><th>Status</th><th>Duration</th></tr>${report.tests.map((t) => `<tr><td>${html(t.title)}</td><td>${t.status}</td><td>${t.durationMs}ms</td></tr>`).join('')}</table></html>`,
);
if (existsSync('.local/server.log'))
  writeFileSync(
    `${target}/server-errors.json`,
    JSON.stringify(safeServerLog(readFileSync('.local/server.log', 'utf8')), null, 2),
  );
if (existsSync(`${qaRoot}/evidence/video-providers.json`))
  writeFileSync(
    `${target}/video-providers.json`,
    JSON.stringify(
      safeVideoReport(JSON.parse(readFileSync(`${qaRoot}/evidence/video-providers.json`, 'utf8'))),
      null,
      2,
    ),
  );
// Only reviewed visual scenarios have screenshots suitable for a public CI artifact.
// Auth/MFA failures can expose QR secrets; never copy test-results or the raw HTML report.
const allowed =
  /^(student-home|catalog|course|lesson|login|profile|admin-home|admin-courses|course-editor|lesson-editor|users|analytics|audit|media|settings|academy-entry|register|library|saved|search|categories)-(mobile|desktop|dark|mobile-dark|desktop-dark)\.png$/;
if (existsSync(`${qaRoot}/screenshots`)) {
  mkdirSync(`${target}/screenshots`, { recursive: true });
  for (const file of readdirSync(`${qaRoot}/screenshots`))
    if (allowed.test(file))
      copyFileSync(`${qaRoot}/screenshots/${file}`, `${target}/screenshots/${file}`);
}
console.log(
  'Prepared sanitized Playwright report, structured error log and approved visual screenshots.',
);
