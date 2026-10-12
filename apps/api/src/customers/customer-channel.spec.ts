import { describe, expect, it } from 'vitest';
import { customerGroupFromSource } from './customer-channel';

describe('customer group from source channel', () => {
  it.each(['Facebook', 'facebook messenger', 'MESSENGER', 'Zalo'])(
    '%s maps to wholesale',
    (source) => {
      expect(customerGroupFromSource(source)).toBe('wholesale');
    },
  );

  it.each(['Shopee', 'TikTok', 'TikTok Shop'])('%s maps to retail', (source) => {
    expect(customerGroupFromSource(source)).toBe('retail');
  });

  it('does not infer a group for manual or unknown sources', () => {
    expect(customerGroupFromSource('Cửa hàng')).toBeNull();
    expect(customerGroupFromSource(null)).toBeNull();
  });
});
