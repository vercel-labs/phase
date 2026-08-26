import { Defer, WhenVisible } from 'phase/react';

import { SharedChart } from '../../packages/charts/src/shared-chart';
import { LazyOverlay } from '../components/lazy-overlay';

export default function DashboardPage() {
  return (
    <main>
      <section aria-label="Current activity">
        <SharedChart />
      </section>

      <Defer>
        <section aria-label="Historical activity">
          <SharedChart />
        </section>
      </Defer>

      <WhenVisible>
        <LazyOverlay />
      </WhenVisible>
    </main>
  );
}
