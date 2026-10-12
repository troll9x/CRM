import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhone } from './customer-normalization';

describe('customer contact normalization', () => {
  it('normalizes Vietnam local and +84 phone forms with common separators identically', () => {
    expect(normalizePhone('0901 234 567')).toBe('+84901234567');
    expect(normalizePhone('+84 (901) 234-567')).toBe('+84901234567');
  });

  it('rejects masked, malformed and incomplete phone numbers instead of treating visible digits as exact', () => {
    expect(normalizePhone('0901***567')).toBeNull();
    expect(normalizePhone('12-34-56-78')).toBeNull();
    expect(normalizePhone('+84 0901 234 567')).toBeNull();
  });

  it('lowercases email without provider-specific dot or plus-tag collapsing', () => {
    expect(normalizeEmail('  First.Last+shop@Example.com ')).toBe('first.last+shop@example.com');
    expect(normalizeEmail('firstlast@example.com')).not.toBe(
      normalizeEmail('first.last@example.com'),
    );
    expect(normalizeEmail('person+shop@example.com')).not.toBe(
      normalizeEmail('person@example.com'),
    );
  });
});
