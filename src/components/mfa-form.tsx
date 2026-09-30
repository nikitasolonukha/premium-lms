'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Copy, Check } from 'lucide-react';
import { enrollMfa, verifyMfa } from '@/lib/actions/auth';
import { Button, Field, Input } from './ui';
export function MfaForm({ factorId }: { factorId?: string }) {
  const [factor, setFactor] = useState(factorId),
    [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [pending, start] = useTransition(),
    [copied, setCopied] = useState(false);
  const router = useRouter();
  return (
    <div className="form-stack">
      {!factor ? (
        <>
          <div className="security-note">
            <ShieldCheck size={25} />
            <p>
              Подключите приложение-аутентификатор: Google Authenticator, 1Password или совместимое
              с TOTP.
            </p>
          </div>
          <Button
            busy={pending}
            onClick={() =>
              start(async () => {
                const result = await enrollMfa();
                if (result.ok && result.data) {
                  setFactor(result.data.id);
                  setSetup(result.data);
                } else if (!result.ok) setError(result.error);
              })
            }
          >
            Подключить аутентификатор
          </Button>
        </>
      ) : (
        <>
          {setup && (
            <div className="mfa-setup">
              <img
                src={
                  setup.qr.startsWith('data:')
                    ? setup.qr
                    : `data:image/svg+xml,${encodeURIComponent(setup.qr)}`
                }
                width={190}
                height={190}
                alt="QR-код настройки аутентификатора"
              />
              <p>Отсканируйте QR-код или скопируйте ключ:</p>
              <button
                className="mfa-secret"
                onClick={async () => {
                  await navigator.clipboard.writeText(setup.secret);
                  setCopied(true);
                }}
              >
                {setup.secret}
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
          )}
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                setError('');
                const result = await verifyMfa({ factorId: factor, code });
                if (result.ok && result.data) {
                  router.replace(result.data.redirect);
                  router.refresh();
                } else if (!result.ok) setError(result.error);
              });
            }}
          >
            <Field label="Код из приложения">
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="otp-input"
                placeholder="000000"
              />
            </Field>
            <Button busy={pending} disabled={code.length !== 6} type="submit">
              Подтвердить вход
            </Button>
          </form>
        </>
      )}
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      <p className="field-hint">
        Потеряли доступ к аутентификатору? Обратитесь к владельцу академии для восстановления.
      </p>
    </div>
  );
}
