'use client';
import Link from 'next/link';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronDown, LockKeyhole, Play, List, X } from 'lucide-react';
import { completionState } from '@/lib/domain';
import { cn, durationLabel } from '@/lib/utils';
export type ProgramModule = {
  id: string;
  title: string;
  lessons: { id: string; title: string; slug: string; duration: number }[];
};
export function Curriculum({
  modules,
  courseSlug,
  completed,
  sequential,
  currentId,
  compact = false,
  onSelect,
}: {
  modules: ProgramModule[];
  courseSlug: string;
  completed: string[];
  sequential: boolean;
  currentId?: string;
  compact?: boolean;
  onSelect?: () => void;
}) {
  const ids = modules.flatMap((m) => m.lessons.map((l) => l.id));
  return (
    <div className={cn('curriculum', compact && 'curriculum-compact')}>
      {modules.map((m, i) => (
        <details key={m.id} open className="program-module">
          <summary>
            <span>
              <small>МОДУЛЬ {String(i + 1).padStart(2, '0')}</small>
              <strong>{m.title}</strong>
            </span>
            <ChevronDown size={17} />
          </summary>
          <div className="module-lessons">
            {m.lessons.map((l) => {
              const state = completionState(l.id, ids, completed, sequential),
                locked = state === 'locked';
              const content = (
                <>
                  <span className={cn('lesson-status', state)}>
                    {locked ? (
                      <LockKeyhole size={14} />
                    ) : state === 'completed' ? (
                      <Check size={15} />
                    ) : (
                      <Play size={12} />
                    )}
                  </span>
                  <span className="lesson-name">
                    {l.title}
                    <small>
                      {locked ? 'Сначала завершите предыдущие уроки' : durationLabel(l.duration)}
                    </small>
                  </span>
                  {currentId === l.id && <span className="current-dot" />}
                </>
              );
              return locked ? (
                <div key={l.id} className="program-lesson locked" aria-disabled="true">
                  {content}
                </div>
              ) : (
                <Link
                  key={l.id}
                  href={`/courses/${courseSlug}/lessons/${l.slug}`}
                  className={cn('program-lesson', currentId === l.id && 'current')}
                  aria-current={currentId === l.id ? 'page' : undefined}
                  onClick={onSelect}
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
export function MobileCurriculum(props: Parameters<typeof Curriculum>[0]) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="button button-secondary mobile-curriculum-button">
          <List size={18} />
          Программа курса
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="drawer program-drawer">
          <div className="drawer-top">
            <Dialog.Title>Программа курса</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Закрыть программу">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Уроки и состояние прохождения</Dialog.Description>
          <Curriculum {...props} compact onSelect={() => setOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
