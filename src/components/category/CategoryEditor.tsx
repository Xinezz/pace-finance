import { useState, type FormEvent } from 'react';
import { CATEGORY_COLOR_CHOICES, CATEGORY_EMOJI_CHOICES } from '../../domain/defaults';
import { uid } from '../../domain/ids';
import type { Category } from '../../domain/types';
import { useStore } from '../../state/store';
import { Button } from '../ui/Button';
import { Field, Segmented, TextInput } from '../ui/Form';
import { Modal } from '../ui/Modal';
import { CategoryChip } from './CategoryChip';
import { ColorPicker, EmojiPicker } from './Pickers';

interface Props {
  /** Edit this category; omit to create a new one. */
  category?: Category;
  defaultType?: 'expense' | 'income';
  initialName?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

export function CategoryEditorModal({ category, defaultType = 'expense', initialName = '', onClose, onSaved }: Props) {
  const { data, dispatch } = useStore();
  const editing = !!category;
  const [name, setName] = useState(category?.name ?? initialName);
  const [icon, setIcon] = useState(category?.icon ?? CATEGORY_EMOJI_CHOICES[Math.floor(Math.random() * 12)]);
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLOR_CHOICES[Math.floor(Math.random() * CATEGORY_COLOR_CHOICES.length)]);
  const [type, setType] = useState<'expense' | 'income'>(category?.type === 'income' ? 'income' : defaultType);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!category?.builtin) {
      if (!trimmed) return setError('Give your category a name.');
      if (trimmed.length > 30) return setError('Keep the name to 30 characters or fewer.');
      const clash = data.categories.some((c) => c.id !== category?.id && c.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (clash) return setError('You already have a category with that name.');
    }
    if (category) {
      dispatch({ type: 'updateCategory', id: category.id, patch: { name: trimmed, icon, color } });
      onSaved?.(category.id);
    } else {
      const id = uid('cat');
      dispatch({ type: 'addCategory', category: { id, name: trimmed, icon, color, type, builtin: false } });
      onSaved?.(id);
    }
    onClose();
  };

  return (
    <Modal title={editing ? 'Edit category' : 'New category'} description={category?.builtin ? 'Built-in categories keep their name, but you can change how they look.' : undefined} onClose={onClose} width="32rem">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface2 px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Preview</span>
          <CategoryChip category={{ name: name.trim() || 'Category name', icon, color }} />
        </div>
        <Field label="Name" required error={error}>
          <TextInput value={name} onChange={(e) => { setName(e.target.value); setError(null); }} disabled={category?.builtin} maxLength={40} data-autofocus placeholder="e.g. Pets" />
        </Field>
        {!editing && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink">Used for</span>
            <Segmented ariaLabel="Category type" value={type} onChange={setType} options={[{ value: 'expense', label: 'Spending' }, { value: 'income', label: 'Income' }]} />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink">Icon</span>
          <EmojiPicker value={icon} onChange={setIcon} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink">Colour</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">{editing ? 'Save changes' : 'Create category'}</Button>
        </div>
      </form>
    </Modal>
  );
}
