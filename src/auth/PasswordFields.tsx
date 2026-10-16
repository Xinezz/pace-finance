import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { inputClass } from '../components/ui/Form';
import { checkPassword } from './validate';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  /** "current-password" when signing in, "new-password" when choosing one (lets password managers help). */
  autoComplete: 'current-password' | 'new-password';
  id?: string;
  placeholder?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true';
  autoFocus?: boolean;
}

/** A password box with a show/hide toggle. Forwards id and aria props so <Field> can label it. */
export function PasswordInput({ value, onChange, autoComplete, id, placeholder, autoFocus, ...aria }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`${inputClass} pr-11`}
        {...aria}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-1 grid w-9 place-items-center rounded-lg text-muted transition-colors hover:text-ink"
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

const BAR_COLOR = ['var(--c-peach)', 'var(--c-peach)', 'var(--c-butter)', 'var(--c-sage)', 'var(--c-sage-deep)'];

/** Four-segment strength meter that always says what to fix in words (never colour alone). */
export function StrengthMeter({ password, email }: { password: string; email?: string }) {
  if (!password) return null;
  const check = checkPassword(password, email);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full bg-surface2 transition-colors" style={i <= check.score ? { background: BAR_COLOR[check.score] } : undefined} />
          ))}
        </div>
        <span className="w-20 text-right text-xs font-medium text-muted">{check.label}</span>
      </div>
      {check.issues.length > 0 && <ul className="mt-1.5 list-disc pl-5 text-xs text-peach-deep">{check.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}
