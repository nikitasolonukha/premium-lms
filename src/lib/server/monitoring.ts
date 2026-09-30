import 'server-only';
import { headers } from 'next/headers';
import { runtimeEnvironment } from './env';
import { beforeSend, safeErrorEvent, type ErrorEventName } from '../observability';

let monitoring: Promise<typeof import('@sentry/node') | null> | undefined;
export function initializeMonitoring() {
  return (monitoring ??= (async () => {
    const env = runtimeEnvironment();
    if (!env.SENTRY_DSN) return null;
    const sentry = await import('@sentry/node');
    sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT ?? env.DEPLOYMENT_ENV,
      defaultIntegrations: false,
      integrations: [],
      debug: false,
      enableRuntimeChannelInjection: false,
      enableOpenTelemetrySetup: false,
      includeLocalVariables: false,
      includeServerName: false,
      attachStacktrace: false,
      maxBreadcrumbs: 0,
      sendClientReports: false,
      tracePropagationTargets: [],
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        frameContextLines: 0,
      },
      beforeSend,
      beforeSendLog: () => null,
      beforeSendMetric: () => null,
    });
    return sentry;
  })());
}

export async function reportError(
  event: ErrorEventName,
  error: unknown,
  correlation?: string | null,
) {
  if (!correlation) {
    try {
      correlation = (await headers()).get('x-request-id');
    } catch {
      /* startup has no request */
    }
  }
  const safe = safeErrorEvent(event, error, correlation);
  console.error(JSON.stringify(safe));
  try {
    const sentry = await initializeMonitoring();
    if (sentry) {
      sentry.captureEvent(
        beforeSend({
          tags: { request_id: safe.requestId, event: safe.event },
          exception: { values: [{ type: safe.errorKind }] },
          environment: runtimeEnvironment().DEPLOYMENT_ENV,
        }),
      );
      // Bounded flush also delivers on serverless hosts; never mask the original error.
      if (!(await sentry.flush(1500)))
        console.error(JSON.stringify(safeErrorEvent('monitoring.failed', null, safe.requestId)));
    }
  } catch {
    console.error(JSON.stringify(safeErrorEvent('monitoring.failed', null, safe.requestId)));
  }
  return safe.requestId;
}
