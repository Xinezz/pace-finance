import { Hash, X } from 'lucide-react';
import { currencySymbol } from '../../domain/money';
import { cloneElement, forwardRef, isValidElement, useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export const inputClass =
  'h-10 w-full rounded-xl border border-line2 bg-surface px-3 text-body placeholder:text-muted/70 transition-colors focus:border-sage-deep focus:outline-none focus:ring-2 focus:ring-sage/40 disabled:opacity-60 aria-[invalid=true]:border-peach-deep aria-[invalid=true]:ring-peach/30';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean | 'true' }>;
}

/** Wires a visible label, hint and error message to a single control for screen readers. */
export function Field({ label, hint, error, required, className = '', children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })
    : children;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-peach-deep" aria-hidden> *</span>}
        {!required && <span className="ml-1.5 text-xs font-normal text-muted">optional</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="text-xs font-medium text-peach-deep">
          {error}
        </p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className = '', ...rest }, ref) {
  return <input ref={ref} className={`${inputClass} ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...rest }, ref) {
  return <textarea ref={ref} className={`${inputClass} h-auto min-h-20 resize-y py-2 ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className = '', children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${inputClass} appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9 ${className}`} style={{ backgroundImage: chevron }} {...rest}>
      {children}
    </select>
  );
});

const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (v: string) => void;
  currency: string;
}

/** A text input restricted to money-looking characters, with the currency symbol as a prefix. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput({ value, onChange, currency, className = '', ...rest }, ref) {
  const symbol = currencySymbol(currency);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted" aria-hidden>
        {symbol}
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,\-()\s]/g, ''))}
        className={`${inputClass} tabular-nums ${className}`}
        style={{ paddingLeft: `${Math.max(2.1, 1.1 + symbol.length * 0.62)}rem` }}
        {...rest}
      />
    </div>
  );
});

interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}

export function Switch({ checked, onChange, label, description }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'border-sage-deep bg-sage-deep' : 'border-line2 bg-surface2'}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} style={{ height: '1.125rem', width: '1.125rem' }} />
      </button>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  ariaLabel: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel, size = 'md', className = '' }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={`inline-flex rounded-xl bg-surface2 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          aria-label={o.ariaLabel}
          onClick={() => onChange(o.value)}
          className={`rounded-lg font-medium transition-all ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]'} ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  id?: string;
}

export function TagInput({ value, onChange, suggestions = [], id }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '').slice(0, 24);
    if (!tag || value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-line2 bg-surface px-2 py-1.5 focus-within:border-sage-deep focus-within:ring-2 focus-within:ring-sage/40">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sage-soft py-0.5 pl-2 pr-1 text-xs text-sage-deep">
          <Hash size={11} aria-hidden />
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} className="grid h-4 w-4 place-items-center rounded-full hover:bg-sage/30" onClick={() => onChange(value.filter((x) => x !== t))}>
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => draft && add(draft)}
        placeholder={value.length ? '' : 'Add a tag, press Enter'}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm text-body outline-none placeholder:text-muted/70"
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
