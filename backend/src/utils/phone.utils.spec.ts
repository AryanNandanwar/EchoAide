import { normalizePhone } from './phone.utils';

describe('normalizePhone', () => {
  it('returns undefined for missing input', () => {
    expect(normalizePhone()).toBeUndefined();
    expect(normalizePhone('')).toBeUndefined();
  });

  it('returns empty string when input contains no digits', () => {
    expect(normalizePhone('   ')).toBe('');
  });

  it('strips non-digit characters while preserving a leading plus', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('+919876543210');
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567');
  });

  it('trims whitespace before normalizing', () => {
    expect(normalizePhone('  9876543210  ')).toBe('9876543210');
  });

  it('preserves plus-only prefix when digits follow', () => {
    expect(normalizePhone('+1 (800) 555-0100')).toBe('+18005550100');
  });
});
