import { z } from 'zod';
const status = (value?: string) =>
  value === 'passed' ? 'PASS' : value === 'skipped' ? 'UNVERIFIED' : 'FAIL';
type Suite = {
  specs?: {
    title: string;
    file: string;
    tests?: { results?: { status?: string; duration?: number }[] }[];
  }[];
  suites?: Suite[];
};
export function safePlaywrightReport(input: { suites?: Suite[] }) {
  const tests: { title: string; file: string; status: string; durationMs: number }[] = [];
  function visit(suites: Suite[]) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? []) {
          const last = test.results?.at(-1);
          tests.push({
            title: String(spec.title).slice(0, 300),
            file: String(spec.file).slice(0, 200),
            status: status(last?.status),
            durationMs: Math.max(0, Number(last?.duration) || 0),
          });
        }
      visit(suite.suites ?? []);
    }
  }
  visit(input.suites ?? []);
  return { tests };
}
const logSchema = z.object({
  event: z.enum([
    'request.failed',
    'action.failed',
    'database.failed',
    'media.failed',
    'playback.failed',
    'download.failed',
    'readiness.failed',
    'monitoring.failed',
  ]),
  requestId: z.uuid(),
  timestamp: z.iso.datetime(),
  errorKind: z.enum([
    'Error',
    'TypeError',
    'RangeError',
    'SyntaxError',
    'AppError',
    'ConfigurationError',
    'ApplicationError',
  ]),
});
export function safeServerLog(input: string) {
  return input.split(/\r?\n/).flatMap((line) => {
    try {
      const parsed = logSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}
