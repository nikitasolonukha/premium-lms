'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { staffSessionSchema, type StaffSession } from '@/lib/staff-session';
import { continueStaffSession } from '@/lib/actions/session';
import { Button } from './ui';

function deadline(session: StaffSession) {
  return Math.max(
    0,
    Math.min(Date.parse(session.idleExpiresAt), Date.parse(session.absoluteExpiresAt)) -
      Date.parse(session.serverTime),
  );
}
export function StaffSessionWarning({ initial }: { initial: StaffSession }) {
  const [remaining, setRemaining] = useState(() => deadline(initial)),
    [error, setError] = useState(''),
    [pending, start] = useTransition(),
    [generation, setGeneration] = useState(0);
  useEffect(() => {
    let stopped = false,
      target = performance.now() + deadline(initial);
    const controller = new AbortController();
    async function read() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/api/staff-session', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (stopped) return;
        if (response.status === 401 || response.status === 403) {
          target = 0;
          setRemaining(0);
          return;
        }
        if (!response.ok) throw new Error();
        const data = staffSessionSchema.parse(await response.json());
        if (stopped) return;
        target = performance.now() + deadline(data);
        setRemaining(Math.max(0, target - performance.now()));
        setError('');
      } catch {
        if (!stopped) setError('Не удалось проверить сессию. Проверьте соединение.');
      }
    }
    void read();
    const tick = window.setInterval(
      () => setRemaining(Math.max(0, target - performance.now())),
      1000,
    );
    const poll = window.setInterval(() => {
      void read();
    }, 60000);
    document.addEventListener('visibilitychange', read);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(tick);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', read);
    };
  }, [initial, generation]);
  if (remaining > 120000 && !error) return null;
  const expired = remaining <= 0;
  return (
    <aside className="staff-session-warning" role="status" aria-live="polite">
      <div>
        <strong>
          {expired
            ? 'Сессия завершилась. Войдите снова, чтобы сохранить изменения.'
            : remaining <= 120000
              ? 'Сессия администратора скоро завершится'
              : 'Проверка сессии'}
        </strong>
        {!expired && remaining <= 120000 && (
          <p>
            До завершения — {Math.ceil(remaining / 60000)} мин. Продолжите работу или сохраните
            черновик.
          </p>
        )}
        {error && <p>{error}</p>}
      </div>
      {expired ? (
        <Link className="btn btn-secondary" href="/login?next=/admin">
          Войти снова
        </Link>
      ) : (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await continueStaffSession();
              if (result.ok && result.data) {
                setError('');
                setRemaining(deadline(result.data));
                setGeneration((v) => v + 1);
              } else if (!result.ok) setError(result.error);
            })
          }
        >
          Продолжить сессию
        </Button>
      )}
    </aside>
  );
}
