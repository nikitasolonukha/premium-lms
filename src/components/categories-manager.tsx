'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { mutateCategory } from '@/lib/actions/content';
import { Button, Input, Field } from './ui';
import { ConfirmDialog } from './confirm-dialog';
function CategoryRow({ category }: { category: { id: string; name: string; color: string } }) {
  const [name, setName] = useState(category.name),
    [color, setColor] = useState(category.color),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="category-editor-row">
      <Input
        aria-label="Название категории"
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        className="input"
        aria-label="Цвет категории"
        value={color}
        onChange={(e) => setColor(e.target.value)}
      >
        <option value="blue">Синий</option>
        <option value="lime">Лайм</option>
        <option value="lilac">Лиловый</option>
        <option value="peach">Персиковый</option>
      </select>
      <Button
        variant="secondary"
        busy={pending}
        aria-label={`Сохранить категорию ${name}`}
        onClick={() =>
          start(async () => {
            const r = await mutateCategory({ cid: category.id, label: name, color, remove: false });
            if (!r.ok) toast.error(r.error);
            else {
              toast.success('Категория сохранена');
              router.refresh();
            }
          })
        }
      >
        <Save size={17} />
      </Button>
      <ConfirmDialog
        title="Удалить категорию?"
        description="Используемые в редакциях курсов категории удалить нельзя."
        danger
        confirmLabel="Удалить"
        trigger={
          <button className="icon-button" aria-label={`Удалить категорию ${name}`}>
            <Trash2 size={17} />
          </button>
        }
        onConfirm={async () => {
          const r = await mutateCategory({ cid: category.id, label: name, color, remove: true });
          if (!r.ok) {
            toast.error(r.error);
            return false;
          }
          toast.success('Категория удалена');
          router.refresh();
        }}
      />
    </div>
  );
}
export function CategoriesManager({
  categories,
}: {
  categories: { id: string; name: string; color: string }[];
}) {
  const [name, setName] = useState(''),
    [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="panel form-stack">
      <form
        className="category-add"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await mutateCategory({
              cid: crypto.randomUUID(),
              label: name,
              color: 'blue',
              remove: false,
            });
            if (!r.ok) toast.error(r.error);
            else {
              setName('');
              toast.success('Категория добавлена');
              router.refresh();
            }
          });
        }}
      >
        <Field label="Новая категория">
          <Input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Лидерство"
          />
        </Field>
        <Button busy={pending} type="submit">
          <Plus size={17} />
          Добавить
        </Button>
      </form>
      {categories.map((c) => (
        <CategoryRow key={c.id} category={c} />
      ))}
    </div>
  );
}
