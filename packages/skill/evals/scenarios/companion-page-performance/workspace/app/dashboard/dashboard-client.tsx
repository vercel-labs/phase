'use client';

import { HeavyChart } from '../components/charts';
import { AmbientCanvas } from './ambient-canvas';
import styles from './dashboard.module.css';
import { useDashboardStore } from './store';

export function DashboardClient({ activity, summary }: Record<string, unknown>) {
  const dashboard = useDashboardStore();

  return (
    <main>
      <HeavyChart activity={activity} summary={summary} />
      <span>{dashboard.unreadCount}</span>
      <aside className={styles.closed}>
        <AmbientCanvas />
      </aside>
    </main>
  );
}
