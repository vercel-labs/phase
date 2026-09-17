import { DashboardClient } from './dashboard-client';

async function loadSummary() {
  return fetch('https://example.com/api/summary').then((response) =>
    response.json(),
  );
}

async function loadActivity() {
  return fetch('https://example.com/api/activity').then((response) =>
    response.json(),
  );
}

export default async function DashboardPage() {
  const summary = await loadSummary();
  const activity = await loadActivity();

  return <DashboardClient activity={activity} summary={summary} />;
}
