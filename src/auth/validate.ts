/** Client-side checks for the sign-up form. The server enforces its own rules too; these give instant, kind feedback. */

export const MIN_PASSWORD_LENGTH = 10;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns a message when the email is unusable, or null when it looks fine. */
export function validateEmail(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return 'Enter your email address.';
  if (email.length > 254) return 'That email address is too long.';
  // Deliberately simple: one @, something either side, a dot in the domain, no spaces.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'That doesn’t look like an email address.';
  return null;
}

const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd123', '1234567890', '12345678910', '0123456789',
  'qwertyuiop', 'qwerty12345', 'qwerty123456', 'iloveyou123', 'letmein1234', 'welcome1234', 'welcome123',
  'admin12345', 'administrator', 'abc1234567', 'abcdefghij', 'changeme123', 'monkey12345', 'dragon12345',
  'football123', 'baseball123', 'sunshine123', 'princess123', 'trustno1234', 'singapore123', 'asdfghjkl1',
]);

export interface PasswordCheck {
  ok: boolean;
  /** 0 (empty / unusable) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  issues: string[];
}

export function checkPassword(password: string, email = ''): PasswordCheck {
  const issues: string[] = [];
  if (password.length === 0) return { ok: false, score: 0, label: '', issues: [`Use at least ${MIN_PASSWORD_LENGTH} characters.`] };

  if (password.length < MIN_PASSWORD_LENGTH) issues.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);

  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(password|qwerty|letmein|iloveyou|welcome)/.test(lower)) issues.push('That password is too common. Try a few unrelated words.');
  if (/^(.)\1+$/.test(password)) issues.push('Avoid repeating a single character.');

  const local = normalizeEmail(email).split('@')[0];
  if (local.length >= 4 && lower.includes(local)) issues.push('Avoid using your email address in your password.');

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score = 1;
  if (password.length >= 12 && classes >= 2) score = 2;
  if (password.length >= 14 && classes >= 3) score = 3;
  if (password.length >= 18 || (password.length >= 14 && classes === 4)) score = 4;
  if (issues.length > 0) score = Math.min(score, password.length < MIN_PASSWORD_LENGTH ? 0 : 1) as 0 | 1;

  const labels = ['Too weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  return { ok: issues.length === 0, score: score as 0 | 1 | 2 | 3 | 4, label: issues.length > 0 ? 'Too weak' : labels[score], issues };
}
