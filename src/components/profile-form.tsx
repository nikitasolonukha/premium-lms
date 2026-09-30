'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { updateProfile, changePassword } from '@/lib/actions/auth';
import { Button, Field, Input } from './ui';
import { Uploader } from './uploader';
export function ProfileForm({
  firstName,
  lastName,
  avatarId,
}: {
  firstName: string;
  lastName: string;
  avatarId: string | null;
}) {
  const [first, setFirst] = useState(firstName),
    [last, setLast] = useState(lastName),
    [avatar, setAvatar] = useState(avatarId),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await updateProfile({ first_name: first, last_name: last, avatar_id: avatar });
          if (r.ok) {
            toast.success('Профиль обновлён');
            router.refresh();
          } else toast.error(r.error);
        });
      }}
    >
      <div className="form-row">
        <Field label="Имя">
          <Input
            required
            maxLength={80}
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            autoComplete="given-name"
          />
        </Field>
        <Field label="Фамилия">
          <Input
            maxLength={80}
            value={last}
            onChange={(e) => setLast(e.target.value)}
            autoComplete="family-name"
          />
        </Field>
      </div>
      <Field label="Фото профиля">
        <Uploader imagesOnly purpose="avatar" value={avatar} onChange={setAvatar} />
      </Field>
      <Button busy={pending} type="submit" className="align-start">
        Сохранить изменения
      </Button>
    </form>
  );
}
export function PasswordForm() {
  const [password, setPassword] = useState(''),
    [pending, start] = useTransition();
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await changePassword(password);
          if (r.ok) {
            toast.success('Пароль изменён');
            setPassword('');
          } else toast.error(r.error);
        });
      }}
    >
      <Field
        label="Новый пароль"
        hint="От 12 символов, строчные и заглавные латинские буквы, цифры."
      >
        <Input
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <Button variant="secondary" busy={pending} type="submit" className="align-start">
        Обновить пароль
      </Button>
    </form>
  );
}
