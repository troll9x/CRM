export function wholesaleQuantityFrom(quantity: number): number | null {
  if (!Number.isSafeInteger(quantity) || quantity < 5) return null;
  return Math.floor(quantity / 5) * 5;
}
