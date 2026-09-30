'use client';
import { useState, useTransition } from 'react';
import { checkVideoProvider } from '@/lib/actions/video';
import { Button } from './ui';

export function ProviderHealth({ configured }: { configured: ('cloudflare' | 'mux')[] }) {
  const [results, setResults] = useState<Record<string, string>>({}),
    [pending, start] = useTransition();
  return (
    <section className="panel form-stack" aria-labelledby="video-health-title">
      <h2 id="video-health-title">Защищённое видео</h2>
      <p className="muted">
        Подключение настраивается оператором. Проверка подтверждает доступ к API и наличие ключа.
        Воспроизведение проверяется отдельно.
      </p>
      {(['cloudflare', 'mux'] as const).map((provider) => (
        <div className="form-stack" key={provider}>
          <strong>{provider === 'cloudflare' ? 'Cloudflare Stream' : 'Mux'}</strong>
          <p role="status">
            {configured.includes(provider)
              ? (results[provider] ?? 'Настроен · API ещё не проверен')
              : 'Не подключён · NOT CONFIGURED'}
          </p>
          {configured.includes(provider) && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const result = await checkVideoProvider(provider);
                  setResults((previous) => ({
                    ...previous,
                    [provider]: result.ok
                      ? result.data?.status === 'PASS'
                        ? 'API доступен · ключ найден'
                        : 'Проверка API не пройдена'
                      : result.error,
                  }));
                })
              }
            >
              Проверить API {provider}
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
