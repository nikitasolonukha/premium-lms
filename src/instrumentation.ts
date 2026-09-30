export async function register() {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    const { runtimeEnvironment } = await import('./lib/server/env');
    runtimeEnvironment();
    const { initializeMonitoring } = await import('./lib/server/monitoring');
    await initializeMonitoring();
  }
}

export const onRequestError: import('next').Instrumentation.onRequestError = async (
  error,
  request,
) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportError } = await import('./lib/server/monitoring');
  const id = request.headers['x-request-id'];
  await reportError('request.failed', error, typeof id === 'string' ? id : undefined);
};
