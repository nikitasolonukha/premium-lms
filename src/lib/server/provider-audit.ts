import 'server-only';
import { createHmac } from 'node:crypto';
import { runtimeEnvironment } from './env';
import { privilegedClient } from './privileged';
import { protectedProviders } from '../protected-video';

let observation: Promise<void> | undefined;
/** Deployment changes have no web actor. Store only a keyed fingerprint in private schema. */
export function observeProviderConfiguration() {
  return (observation ??= (async () => {
    const env = runtimeEnvironment(),
      providers = protectedProviders(env);
    const configuration = Object.entries(env)
      .filter(([key]) => /^(CLOUDFLARE_|MUX_|VIDEO_PROVIDER$)/.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const fingerprint = createHmac('sha256', env.RATE_LIMIT_SECRET)
      .update('lms:video-configuration:v1\0')
      .update(JSON.stringify(configuration))
      .digest('hex');
    const result = await privilegedClient()
      .rpc('observe_video_config', {
        environment: env.DEPLOYMENT_ENV,
        fingerprint,
        cloudflare: providers.includes('cloudflare'),
        mux: providers.includes('mux'),
      })
      .abortSignal(AbortSignal.timeout(2500));
    if (result.error) throw new Error('Provider configuration audit unavailable');
  })().catch((error) => {
    observation = undefined;
    throw error;
  }));
}
