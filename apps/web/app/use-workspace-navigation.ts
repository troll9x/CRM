'use client';
import { useSyncExternalStore } from 'react';
import { allowedWorkspaces, resolveWorkspace, type WorkspaceId } from './workspace-navigation';

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
    window.removeEventListener('popstate', onChange);
  };
}
const snapshot = () => window.location.hash;
const serverSnapshot = () => '';

export function useWorkspaceNavigation(permissions: readonly string[]) {
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const items = allowedWorkspaces(permissions);
  const view = resolveWorkspace(hash, items);
  function navigate(next: WorkspaceId) {
    if (!items.some((item) => item.id === next) || view === next) return;
    window.history.pushState(null, '', `#${next}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  return { view, navigate, items };
}
