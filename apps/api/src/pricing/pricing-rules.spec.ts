import { describe, expect, it } from 'vitest';
import { wholesaleQuantityFrom } from './pricing-rules';

describe('wholesale quantity tiers', () => {
  it.each([
    [1, null],
    [4, null],
    [5, 5],
    [6, 5],
    [9, 5],
    [10, 10],
    [11, 10],
    [14, 10],
    [15, 15],
    [19, 15],
    [20, 20],
  ])('quantity %s resolves to tier %s', (quantity, expected) => {
    expect(wholesaleQuantityFrom(quantity)).toBe(expected);
  });

  it('rejects non-positive, fractional, and unsafe quantities', () => {
    expect(wholesaleQuantityFrom(0)).toBeNull();
    expect(wholesaleQuantityFrom(5.5)).toBeNull();
    expect(wholesaleQuantityFrom(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });
});
