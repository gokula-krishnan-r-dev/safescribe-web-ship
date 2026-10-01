'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, CheckCircle2, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

// ─── Sensors ─────────────────────────────────────────────────────────────────

export function usePathwaySensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

// ─── Selection ───────────────────────────────────────────────────────────────

export function usePathwaySelection(validIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const valid = new Set(validIds);
    setSelectedIds((prev) => {
      const kept = [...prev].filter((id) => valid.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [validIds]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  const selectedList = [...selectedIds];
  const count = selectedIds.size;

  return { selectedIds, selectedList, count, toggle, toggleAll, clear };
}

// ─── Order state ─────────────────────────────────────────────────────────────

export function usePathwayOrder<T extends { id: string }>(
  items: T[],
  sortFn?: (a: T, b: T) => number,
) {
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    const sorted = sortFn ? [...items].sort(sortFn) : [...items];
    setOrder(sorted.map((item) => item.id));
  }, [items, sortFn]);

  const orderedItems = order
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is T => Boolean(item));

  const handleDragEnd = async (
    event: DragEndEvent,
    onPersist: (nextOrder: string[]) => Promise<void>,
  ) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = order;
    const nextOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(nextOrder);

    try {
      await onPersist(nextOrder);
    } catch {
      setOrder(previous);
      throw new Error('reorder failed');
    }
  };

  return { order, orderedItems, setOrder, handleDragEnd };
}

// ─── Bulk toolbar ─────────────────────────────────────────────────────────────

export function PathwayBulkToolbar({
  count,
  onApprove,
  onDelete,
  onClear,
  approvePending,
  deletePending,
  showApprove = true,
}: {
  count: number;
  onApprove?: () => void;
  onDelete: () => void;
  onClear: () => void;
  approvePending?: boolean;
  deletePending?: boolean;
  showApprove?: boolean;
}) {
  if (count === 0) return null;

  const busy = approvePending || deletePending;

  return (
    <>
      {showApprove && onApprove && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={onApprove}
          disabled={busy}
        >
          {approvePending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          )}
          Approve ({count})
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive hover:bg-destructive/10"
        onClick={onDelete}
        disabled={busy}
      >
        {deletePending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Delete ({count})
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs text-muted-foreground"
        onClick={onClear}
        disabled={busy}
      >
        Clear
      </Button>
    </>
  );
}

// ─── Checkbox ────────────────────────────────────────────────────────────────

export function PathwaySelectCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Checkbox
      checked={checked}
      indeterminate={indeterminate}
      onChange={() => onChange()}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      size="sm"
      className={className}
    />
  );
}

// ─── Drag handle ─────────────────────────────────────────────────────────────

export function PathwayDragHandle({
  listeners,
  attributes,
  disabled,
}: {
  listeners?: ReturnType<typeof useSortable>['listeners'];
  attributes?: ReturnType<typeof useSortable>['attributes'];
  disabled?: boolean;
}) {
  if (disabled) return null;

  return (
    <button
      type="button"
      className="mt-0.5 flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing"
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}

// ─── Sortable row wrapper ────────────────────────────────────────────────────

export function usePathwaySortableRow(id: string, disabled?: boolean) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  return {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
    },
  };
}

// ─── Sortable list provider ──────────────────────────────────────────────────

export function PathwaySortableList({
  ids,
  canEdit,
  onDragEnd,
  children,
}: {
  ids: string[];
  canEdit: boolean;
  onDragEnd: (event: DragEndEvent) => void;
  children: React.ReactNode;
}) {
  const sensors = usePathwaySensors();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        if (!canEdit) return;
        onDragEnd(event);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}

export function sortableRowClassName({
  selected,
  isDragging,
  muted,
}: {
  selected?: boolean;
  isDragging?: boolean;
  muted?: boolean;
}) {
  return cn(
    'group flex items-start gap-2.5 px-4 py-3.5 sm:gap-3 sm:px-5',
    muted && 'bg-muted/30 opacity-60',
    selected && 'bg-primary/[0.04]',
    isDragging && 'z-10 rounded-lg border border-primary/30 bg-card shadow-md',
  );
}
