import { DashboardClient } from './dashboard-client';

export default async function Page() {
  const summary = await fetch('https://example.com/api/summary').then(
    (response) => response.json(),
  );
  const activity = await fetch('https://example.com/api/activity').then(
    (response) => response.json(),
  );

  return <DashboardClient activity={activity} summary={summary} />;
}
