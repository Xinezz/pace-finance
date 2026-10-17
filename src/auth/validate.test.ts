import { describe, expect, it } from 'vitest';
import { checkPassword, MIN_PASSWORD_LENGTH, normalizeEmail, validateEmail } from './validate';

describe('validateEmail', () => {
  it('accepts ordinary addresses and ignores case and surrounding spaces', () => {
    expect(validateEmail('sam@example.com')).toBeNull();
    expect(validateEmail('  Sam.Lee+pace@Example.co.uk ')).toBeNull();
    expect(normalizeEmail('  Sam@Example.COM ')).toBe('sam@example.com');
  });

  it('rejects empty and malformed addresses with a helpful message', () => {
    expect(validateEmail('')).toMatch(/enter your email/i);
    expect(validateEmail('   ')).toMatch(/enter your email/i);
    expect(validateEmail('sam')).toMatch(/email address/i);
    expect(validateEmail('sam@')).not.toBeNull();
    expect(validateEmail('sam@example')).not.toBeNull();
    expect(validateEmail('sa m@example.com')).not.toBeNull();
    expect(validateEmail('a@b.c')).not.toBeNull();
    expect(validateEmail(`${'a'.repeat(250)}@example.com`)).toMatch(/too long/i);
  });
});

describe('checkPassword', () => {
  it('requires a minimum length', () => {
    const r = checkPassword('short1!');
    expect(r.ok).toBe(false);
    expect(r.score).toBe(0);
    expect(r.issues.join(' ')).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('rejects very common passwords even when long enough', () => {
    expect(checkPassword('password123').ok).toBe(false);
    expect(checkPassword('qwertyuiop').ok).toBe(false);
    expect(checkPassword('Password2024!!').ok).toBe(false); // still starts with "password"
    expect(checkPassword('aaaaaaaaaaaa').ok).toBe(false);
  });

  it('rejects passwords that contain the email name', () => {
    expect(checkPassword('samuellee-2026!', 'samuellee@example.com').ok).toBe(false);
    expect(checkPassword('samuellee-2026!', 'someone.else@example.com').ok).toBe(true);
  });

  it('rewards length over fiddly rules', () => {
    const passphrase = checkPassword('maple river lantern quiet');
    expect(passphrase.ok).toBe(true);
    expect(passphrase.score).toBeGreaterThanOrEqual(3);
    expect(checkPassword('Tr0ub4dor&3x').score).toBeLessThanOrEqual(checkPassword('correct horse battery staple').score);
  });

  it('handles the empty string without throwing', () => {
    expect(checkPassword('')).toMatchObject({ ok: false, score: 0 });
  });
});
