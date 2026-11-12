import { describe, expect, it } from 'vitest';
import { allowedWorkspaces, resolveWorkspace, searchWorkspaces } from './workspace-navigation';

describe('Workspace navigation with real permission boundaries', () => {
  it('does not open administration through a URL for a sales-only account', () => {
    const items = allowedWorkspaces(['customers.read', 'orders.read']);
    expect(items.map((item) => item.id)).toEqual(['customers', 'orders']);
    expect(resolveWorkspace('#staff', items)).toBe('customers');
    expect(resolveWorkspace('#orders', items)).toBe('orders');
  });
  it('gives an account without permissions a deliberate empty landing', () => {
    expect(resolveWorkspace('#overview', allowedWorkspaces([]))).toBeNull();
  });
  it('recognizes the distinct return permissions without exposing finance or staff', () => {
    expect(allowedWorkspaces(['returns.inspect']).map((item) => item.id)).toEqual(['returns']);
  });
  it('supports Vietnamese words without accents and known channel terms', () => {
    const items = allowedWorkspaces(['staff.manage', 'integrations.read', 'orders.read']);
    expect(searchWorkspaces('phan quyen', items).map((item) => item.id)).toEqual(['staff']);
    expect(searchWorkspaces('facebook', items).map((item) => item.id)).toEqual(['integrations']);
    expect(searchWorkspaces('bang gia', items)).toEqual([]);
  });
});
