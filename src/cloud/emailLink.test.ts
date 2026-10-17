import { describe, expect, it } from 'vitest';
import { readEmailLink, withoutEmailLink } from './emailLink';

const base = 'https://xinezz.github.io/pace-finance/';

describe('readEmailLink', () => {
  it('ignores ordinary visits and page routes', () => {
    expect(readEmailLink(base)).toBeNull();
    expect(readEmailLink(`${base}#/transactions?q=coffee`)).toBeNull();
  });

  it('reads token_hash links (they work on any device)', () => {
    expect(readEmailLink(`${base}?token_hash=abc123&type=recovery`)).toEqual({ tokenHash: 'abc123', type: 'recovery' });
    expect(readEmailLink(`${base}?token_hash=abc123&type=email`)).toEqual({ tokenHash: 'abc123', type: 'email' });
  });

  it('refuses unknown link types', () => {
    expect(readEmailLink(`${base}?token_hash=abc123&type=admin`)).toBeNull();
  });

  it('reads one-time code links', () => {
    expect(readEmailLink(`${base}?code=c0de`)).toEqual({ code: 'c0de' });
  });

  it('reads errors from the query or the #fragment', () => {
    expect(readEmailLink(`${base}?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`)).toEqual({ errorCode: 'otp_expired' });
    expect(readEmailLink(`${base}#error=access_denied&error_code=otp_expired&error_description=x`)).toEqual({ errorCode: 'otp_expired' });
    expect(readEmailLink(`${base}#error_description=Something+failed`)).toEqual({ errorCode: 'unknown' });
  });
});

describe('withoutEmailLink', () => {
  it('removes link details but keeps the page and route', () => {
    expect(withoutEmailLink(`${base}?token_hash=abc&type=recovery`)).toBe('/pace-finance/');
    expect(withoutEmailLink(`${base}?code=x&keep=1#/settings`)).toBe('/pace-finance/?keep=1#/settings');
    expect(withoutEmailLink(`${base}#error=access_denied&error_code=otp_expired`)).toBe('/pace-finance/');
  });
});
