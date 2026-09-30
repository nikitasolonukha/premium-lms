export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { runtimeEnvironment } = await import('./lib/server/env');
    runtimeEnvironment();
  }
}
