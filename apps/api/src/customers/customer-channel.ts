const WHOLESALE_SOURCES = new Set(['facebook', 'facebook messenger', 'messenger', 'zalo']);
const RETAIL_SOURCES = new Set(['shopee', 'tiktok', 'tiktok shop']);

export function customerGroupFromSource(source?: string | null): 'wholesale' | 'retail' | null {
  const normalized = source
    ?.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
  if (!normalized) return null;
  if (WHOLESALE_SOURCES.has(normalized)) return 'wholesale';
  if (RETAIL_SOURCES.has(normalized)) return 'retail';
  return null;
}
