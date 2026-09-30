'use client';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import type { ActionResult } from '@/lib/server/errors';
import { Button, Field, Input } from './ui';
type Values = { email: string; password: string; first_name: string; last_name: string };
export function AuthForm({
  mode,
  next,
  notice,
}: {
  mode: 'login' | 'register' | 'forgot' | 'reset';
  next?: string;
  notice?: string;
}) {
  const {
    register: field,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>();
  const [pending, start] = useTransition(),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [visible, setVisible] = useState(false);
  const router = useRouter();
  const submit = handleSubmit((values) =>
    start(async () => {
      setError('');
      let result: ActionResult<{ redirect?: string; message?: string }>;
      try {
        const response = await fetch('/api/auth/' + mode, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            values:
              mode === 'login'
                ? { email: values.email, password: values.password }
                : mode === 'register'
                  ? values
                  : mode === 'forgot'
                    ? values.email
                    : values.password,
            next,
          }),
        });
        result = await response.json();
      } catch {
        setError('Нет соединения. Проверьте сеть и повторите попытку.');
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data && result.data.redirect) {
        router.replace(result.data.redirect);
        router.refresh();
      } else if (result.data && result.data.message) setSuccess(result.data.message);
    }),
  );
  return (
    <>
      {notice && <div className="notice">{notice}</div>}
      {success ? (
        <div className="auth-success" role="status">
          <CheckCircle2 size={32} />
          <h3>{mode === 'reset' ? 'Готово' : 'Проверьте почту'}</h3>
          <p>{success}</p>
          <Link className="button button-primary" href={mode === 'reset' ? '/dashboard' : '/login'}>
            {mode === 'reset' ? 'В академию' : 'Вернуться ко входу'}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack" noValidate>
          {mode === 'register' && (
            <div className="form-row">
              <Field label="Имя" error={errors.first_name?.message}>
                <Input
                  autoComplete="given-name"
                  {...field('first_name', { required: 'Введите имя', maxLength: 80 })}
                />
              </Field>
              <Field label="Фамилия">
                <Input autoComplete="family-name" {...field('last_name', { maxLength: 80 })} />
              </Field>
            </div>
          )}
          {mode !== 'reset' && (
            <Field label="Email" error={errors.email?.message}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...field('email', {
                  required: 'Введите email',
                  pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Проверьте email' },
                })}
              />
            </Field>
          )}
          {mode !== 'forgot' && (
            <Field
              label={mode === 'reset' ? 'Новый пароль' : 'Пароль'}
              error={errors.password?.message}
              hint={
                mode !== 'login'
                  ? 'От 12 символов, строчные и заглавные латинские буквы, цифры.'
                  : undefined
              }
            >
              <div className="password-input">
                <Input
                  type={visible ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  {...field('password', { required: 'Введите пароль' })}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
          )}
          {mode === 'login' && (
            <Link href="/forgot-password" className="forgot-link">
              Не помню пароль
            </Link>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" busy={pending} className="full-width">
            {mode === 'login'
              ? 'Войти в академию'
              : mode === 'register'
                ? 'Создать аккаунт'
                : mode === 'forgot'
                  ? 'Отправить ссылку'
                  : 'Сохранить пароль'}
            <ArrowRight size={18} />
          </Button>
        </form>
      )}
      {mode === 'login' && (
        <p className="auth-switch">
          Первый раз здесь? <Link href="/register">Создать аккаунт</Link>
        </p>
      )}
      {mode === 'register' && (
        <p className="auth-switch">
          Уже учитесь с нами? <Link href="/login">Войти</Link>
        </p>
      )}
      {mode === 'forgot' && (
        <p className="auth-switch">
          <Link href="/login">Вернуться ко входу</Link>
        </p>
      )}
    </>
  );
}
