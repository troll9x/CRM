import { describe, expect, it } from 'vitest';
import { priceQuantityFrom } from './pricing-rules';

describe('wholesale quantity tiers', () => {
  it.each([
    ['0.5', 1],
    ['4.999999', 1],
    [5, 5],
    ['6.5', 5],
    ['9.999999', 5],
    [10, 10],
    ['11.5', 10],
    ['14.999999', 10],
    [15, 15],
    [19, 15],
    [20, 20],
  ])('quantity %s resolves to tier %s', (quantity, expected) => {
    expect(priceQuantityFrom(String(quantity))).toBe(expected);
  });

  it('resolves retail price to tier 1 and handles six-place fractional quantities exactly', () => {
    expect(priceQuantityFrom('1')).toBe(1);
    expect(priceQuantityFrom('10.000001')).toBe(10);
    expect(priceQuantityFrom('100000000')).toBe(100000000);
  });
});
