'use client';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
function SortableItem({ id, children, label }: { id: string; children: ReactNode; label: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      className={`sortable-item ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="sort-handle icon-button"
        {...attributes}
        {...listeners}
        aria-label={`Изменить порядок: ${label}`}
      >
        <GripVertical size={17} />
      </button>
      <div className="sortable-content">{children}</div>
    </div>
  );
}
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  render,
  label,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  render: (item: T, index: number) => ReactNode;
  label: (item: T) => string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: 'instant',
    }),
  );
  function end(event: DragEndEvent) {
    if (event.over && event.active.id !== event.over.id)
      onReorder(
        arrayMove(
          items,
          items.findIndex((i) => i.id === event.active.id),
          items.findIndex((i) => i.id === event.over!.id),
        ),
      );
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={end}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Нажмите пробел, затем стрелки для перемещения. Ещё раз пробел — сохранить порядок. Escape — отменить.',
        },
      }}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => (
          <SortableItem id={item.id} key={item.id} label={label(item)}>
            {render(item, index)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}
