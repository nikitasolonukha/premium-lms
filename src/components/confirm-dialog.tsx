'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useState, useTransition, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui';
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Подтвердить',
  danger = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<boolean | void>;
}) {
  const [open, setOpen] = useState(false),
    [pending, start] = useTransition();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!pending) setOpen(v);
      }}
    >
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="dialog-description">{description}</Dialog.Description>
          <Dialog.Close
            className="icon-button dialog-close"
            aria-label="Закрыть диалог"
            disabled={pending}
          >
            <X size={18} />
          </Dialog.Close>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={pending}>
                Отмена
              </Button>
            </Dialog.Close>
            <Button
              variant={danger ? 'danger' : 'primary'}
              busy={pending}
              onClick={() =>
                start(async () => {
                  const okay = await onConfirm();
                  if (okay !== false) setOpen(false);
                })
              }
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
