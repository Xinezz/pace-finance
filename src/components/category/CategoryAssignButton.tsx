import { Tag } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { categoryAllowsType } from '../../domain/categorize';
import type { TxType } from '../../domain/types';
import { useStore } from '../../state/store';
import { Button, type ButtonVariant } from '../ui/Button';
import { Popover } from '../ui/Popover';
import { CategoryEditorModal } from './CategoryEditor';
import { CategoryPanel } from './CategoryPicker';

interface Props {
  /** The transaction types being assigned; only categories valid for ALL of them are offered. */
  types: TxType[];
  onAssign: (categoryId: string) => void;
  children?: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
}

/** "Assign category…" button: opens a picker, used for bulk categorization. */
export function CategoryAssignButton({ types, onAssign, children = 'Set category', variant = 'primary', disabled }: Props) {
  const { data } = useStore();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const usable = useMemo(() => {
    const kinds = types.filter((t) => t !== 'transfer');
    return data.categories.filter((c) => c.type !== 'transfer' && kinds.every((t) => categoryAllowsType(c, t)));
  }, [data.categories, types]);

  return (
    <>
      <Button ref={ref} variant={variant} size="sm" disabled={disabled} icon={<Tag size={14} />} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {children}
      </Button>
      <Popover anchorRef={ref} open={open} onClose={() => setOpen(false)} label="Choose a category" width={300}>
        <CategoryPanel
          categories={usable}
          autoFocusSearch
          onSelect={(id) => {
            setOpen(false);
            onAssign(id);
          }}
          onCreate={(n) => {
            setOpen(false);
            setCreating(n);
          }}
        />
      </Popover>
      {creating !== null && <CategoryEditorModal initialName={creating} defaultType={types.includes('income') && !types.includes('expense') ? 'income' : 'expense'} onClose={() => setCreating(null)} onSaved={onAssign} />}
    </>
  );
}
