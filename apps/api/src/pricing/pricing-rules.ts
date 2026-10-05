export function priceQuantityFrom(quantity: string): number {
  const [whole = '', fraction = ''] = quantity.split('.');
  const scaledQuantity = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (scaledQuantity <= 0n || scaledQuantity > 1_000_000_000_000_000n) {
    throw new Error('Quantity must be a positive decimal no greater than 1,000,000,000');
  }
  if (scaledQuantity < 5_000_000n) return 1;
  return Number((scaledQuantity / 5_000_000n) * 5n);
}
