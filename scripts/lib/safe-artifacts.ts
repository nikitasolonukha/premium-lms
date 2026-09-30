import { z } from 'zod';
const status = (value?: string) =>
  value === 'passed' ? 'PASS' : value === 'skipped' ? 'UNVERIFIED' : 'FAIL';

const publicVideoReportSchema = z.object({
  executedAt: z.iso.datetime(),
  environment: z.object({
    browserVersion: z.string().regex(/^[\d.]{1,32}$/),
    headless: z.boolean(),
    widevineAvailable: z.boolean(),
  }),
  results: z
    .array(
      z.object({
        provider: z.enum(['youtube', 'vimeo', 'rutube', 'direct', 'external']),
        status: z.enum(['PASS', 'FAIL']),
        playbackSeconds: z.number().min(0).max(86400).optional(),
        fullscreenWatermark: z.boolean().optional(),
        mediaState: z
          .object({
            time: z.number().min(0).max(86400),
            ready: z.number().int().min(0).max(4),
            network: z.number().int().min(0).max(3),
            error: z.number().int().min(1).max(4).nullable(),
          })
          .nullable()
          .optional(),
        sourceResponses: z
          .array(
            z.object({
              status: z.number().int().min(100).max(599).optional(),
              error: z
                .string()
                .regex(/^(net::ERR_[A-Z_]+|SOURCE_REQUEST_FAILED)$/)
                .optional(),
              kind: z.enum(['document', 'media', 'other', 'fetch', 'xhr']),
            }),
          )
          .max(50)
          .optional(),
      }),
    )
    .max(5),
});
export function safeVideoReport(input: unknown) {
  const report = publicVideoReportSchema.parse(input);
  return {
    ...report,
    status:
      report.results.length === 5 && report.results.every((result) => result.status === 'PASS')
        ? 'PASS'
        : 'FAIL',
  };
}
type Suite = {
  specs?: {
    title: string;
    file: string;
    tests?: {
      results?: {
        status?: string;
        duration?: number;
        error?: { stack?: string; message?: string };
      }[];
    }[];
  }[];
  suites?: Suite[];
};
export function safePlaywrightReport(input: { suites?: Suite[] }) {
  const tests: {
    title: string;
    file: string;
    status: string;
    durationMs: number;
    failureLocation?: string;
  }[] = [];
  function visit(suites: Suite[]) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? []) {
          const last = test.results?.at(-1);
          const location = last?.error?.stack?.match(
            /(?:tests[\\/]e2e[\\/]([\w.-]+\.ts)):(\d{1,6}):(\d{1,6})/,
          );
          tests.push({
            title: String(spec.title).slice(0, 300),
            file: String(spec.file).slice(0, 200),
            status: status(last?.status),
            durationMs: Math.max(0, Number(last?.duration) || 0),
            ...(location
              ? { failureLocation: location[1] + ':' + location[2] + ':' + location[3] }
              : {}),
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
