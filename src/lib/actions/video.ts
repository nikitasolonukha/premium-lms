'use server';
import { z } from 'zod';
import { createProtectedAdapter, protectedProviders } from '../protected-video';
import { assertStaffAction } from '../server/auth';
import { runtimeEnvironment } from '../server/env';
import { userLimit } from '../server/limits';
import { actionResult } from '../server/errors';
import { reportError } from '../server/monitoring';
import { observeProviderConfiguration } from '../server/provider-audit';

export async function checkVideoProvider(input: unknown) {
  return actionResult(async () => {
    await assertStaffAction(true);
    await userLimit('admin');
    await observeProviderConfiguration();
    const provider = z.enum(['cloudflare', 'mux']).parse(input),
      env = runtimeEnvironment();
    if (!protectedProviders(env).includes(provider)) return { status: 'NOT CONFIGURED' as const };
    try {
      await createProtectedAdapter(provider, env).checkConnection();
      return { status: 'PASS' as const };
    } catch (error) {
      await reportError('playback.failed', error);
      return { status: 'FAIL' as const };
    }
  });
}
