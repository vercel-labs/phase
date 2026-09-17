'use client';

import { useSyncExternalStore } from 'react';

const snapshot = { filters: [], theme: 'dark', unreadCount: 0 };

function subscribe(callback: () => void) {
  window.addEventListener('dashboard-change', callback);
  return () => window.removeEventListener('dashboard-change', callback);
}

export function useDashboardStore() {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
