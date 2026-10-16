import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { CATEGORY_COLOR_CHOICES, CATEGORY_EMOJI_CHOICES } from '../../domain/defaults';

export function ColorPicker({ value, onChange, label = 'Colour' }: { value: string; onChange: (hex: string) => void; label?: string }) {
  const customId = useId();
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {CATEGORY_COLOR_CHOICES.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Colour ${hex}`}
          aria-pressed={value.toLowerCase() === hex.toLowerCase()}
          onClick={() => onChange(hex)}
          className="grid h-8 w-8 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-ink"
          style={{ background: hex }}
        >
          {value.toLowerCase() === hex.toLowerCase() && <Check size={14} className="text-ink" aria-hidden />}
        </button>
      ))}
      <label htmlFor={customId} className="relative grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line2 text-[10px] text-muted" title="Custom colour">
        +
        <input id={customId} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" />
      </label>
    </div>
  );
}

export function EmojiPicker({ value, onChange, label = 'Icon' }: { value: string; onChange: (emoji: string) => void; label?: string }) {
  const [custom, setCustom] = useState('');
  const id = useId();
  return (
    <div>
      <div role="group" aria-label={label} className="grid grid-cols-8 gap-1 sm:grid-cols-12">
        {CATEGORY_EMOJI_CHOICES.map((e) => (
          <button
            key={e}
            type="button"
            aria-label={`Icon ${e}`}
            aria-pressed={value === e}
            onClick={() => onChange(e)}
            className="grid aspect-square place-items-center rounded-xl text-lg transition-colors hover:bg-surface2 aria-pressed:bg-sage-soft aria-pressed:ring-2 aria-pressed:ring-sage-deep"
          >
            {e}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={id} className="text-xs text-muted">
          Or type any emoji
        </label>
        <input
          id={id}
          value={custom}
          maxLength={4}
          onChange={(e) => {
            setCustom(e.target.value);
            const first = [...e.target.value.trim()][0];
            if (first) onChange(first);
          }}
          className="h-8 w-16 rounded-lg border border-line2 bg-surface px-2 text-center text-lg"
          aria-label="Custom emoji"
        />
      </div>
    </div>
  );
}
