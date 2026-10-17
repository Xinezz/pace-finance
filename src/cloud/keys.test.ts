import { describe, expect, it } from 'vitest';
import { classifyKey, keyProblem } from './keys';

/** Build an unsigned JWT-shaped string with the given payload (only the payload matters here). */
function fakeJwt(payload: object): string {
  const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.signature`;
}

describe('classifyKey', () => {
  it('recognises the current key formats', () => {
    expect(classifyKey('sb_publishable_abc123')).toBe('publishable');
    expect(classifyKey('  sb_publishable_abc123  ')).toBe('publishable');
    expect(classifyKey('sb_secret_abc123')).toBe('secret');
  });

  it('recognises legacy JWT keys by their role', () => {
    expect(classifyKey(fakeJwt({ role: 'anon', iss: 'supabase' }))).toBe('legacy-anon');
    expect(classifyKey(fakeJwt({ role: 'service_role', iss: 'supabase' }))).toBe('secret');
  });

  it('does not guess about anything else', () => {
    expect(classifyKey('hello')).toBe('unknown');
    expect(classifyKey('eyJ.not-base64.x')).toBe('unknown');
  });
});

describe('keyProblem', () => {
  const url = 'https://abcd.supabase.co';

  it('is fine when nothing is configured (local-only mode) or a publishable key is used', () => {
    expect(keyProblem(undefined, undefined)).toBeNull();
    expect(keyProblem('', '')).toBeNull();
    expect(keyProblem(url, 'sb_publishable_abc')).toBeNull();
    expect(keyProblem(url, fakeJwt({ role: 'anon' }))).toBeNull();
  });

  it('refuses secret keys in the browser', () => {
    expect(keyProblem(url, 'sb_secret_abc')).toMatch(/SECRET key/);
    expect(keyProblem(url, fakeJwt({ role: 'service_role' }))).toMatch(/SECRET key/);
  });

  it('points out half-finished configuration', () => {
    expect(keyProblem(url, '')).toMatch(/PUBLISHABLE_KEY is missing/);
    expect(keyProblem('', 'sb_publishable_abc')).toMatch(/URL is missing/);
    expect(keyProblem('abcd.supabase.co', 'sb_publishable_abc')).toMatch(/https/);
  });
});
