import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ColorPicker, EmojiPicker } from '../../components/category/Pickers';
import { Button } from '../../components/ui/Button';
import { Field, MoneyInput, TextInput, Textarea } from '../../components/ui/Form';
import { Modal } from '../../components/ui/Modal';
import { isValidDateStr } from '../../domain/dates';
import { uid } from '../../domain/ids';
import { minorToInput, parseAmount } from '../../domain/money';
import type { Goal } from '../../domain/types';
import { useFeedback } from '../../state/feedback';
import { useStore } from '../../state/store';

export function GoalModal({ goal, onClose }: { goal?: Goal; onClose: () => void }) {
  const { data, dispatch, today } = useStore();
  const { toast, confirm } = useFeedback();
  const currency = data.settings.currency;
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? minorToInput(goal.target, currency) : '');
  const [starting, setStarting] = useState(goal ? minorToInput(goal.startingAmount, currency) : '');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [icon, setIcon] = useState(goal?.icon ?? '🎯');
  const [color, setColor] = useState(goal?.color ?? '#E8DDAA');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const t = parseAmount(target, currency);
    const s = starting.trim() ? parseAmount(starting, currency) : 0;
    if (!name.trim()) errs.name = 'Give your goal a name.';
    if (t === null || t <= 0) errs.target = 'Enter a target larger than zero.';
    if (s === null || s < 0) errs.starting = 'Enter zero or a positive amount.';
    if (date && !isValidDateStr(date)) errs.date = 'Pick a valid date.';
    else if (date && !goal && date < today) errs.date = 'The target date should be in the future.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const base = { name: name.trim(), target: t!, targetDate: date || undefined, description: description.trim() || undefined, icon, color };
    if (goal) {
      dispatch({ type: 'updateGoal', id: goal.id, patch: { ...base, ...(s !== null && s !== goal.startingAmount ? { startingAmount: s } : {}) } });
      toast('Goal updated.');
    } else {
      dispatch({ type: 'addGoal', goal: { id: uid('goal'), ...base, startingAmount: s ?? 0, startDate: today } });
      toast(`“${name.trim()}” is set. Every bit counts.`);
    }
    onClose();
  };

  const remove = async () => {
    if (!goal) return;
    const ok = await confirm({
      title: `Delete “${goal.name}”?`,
      tone: 'danger',
      confirmLabel: 'Delete goal',
      message: 'The goal and its contribution history are removed. Money you already moved into savings stays where it is; it just won’t be assigned to this goal.',
    });
    if (!ok) return;
    dispatch({ type: 'deleteGoal', id: goal.id });
    toast('Goal deleted.');
    onClose();
  };

  return (
    <Modal title={goal ? 'Edit goal' : 'New savings goal'} onClose={onClose} width="34rem">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="Goal name" required error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund, Holiday, New laptop" maxLength={50} data-autofocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Target amount" required error={errors.target}>
            <MoneyInput value={target} onChange={setTarget} currency={currency} />
          </Field>
          <Field label="Already saved" error={errors.starting} hint="What you have set aside for this today.">
            <MoneyInput value={starting} onChange={setStarting} currency={currency} />
          </Field>
        </div>
        <Field label="Target date" error={errors.date}>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={200} placeholder="Why does this matter to you?" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink">Icon</span>
          <EmojiPicker value={icon} onChange={setIcon} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink">Colour</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
          {goal ? <Button variant="danger" icon={<Trash2 size={14} />} onClick={remove}>Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">{goal ? 'Save changes' : 'Create goal'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
