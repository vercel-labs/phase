import { render, waitFor } from '@testing-library/react';

import { WhenIdle } from '.';

it('mounts after the browser idle scheduling path runs', async () => {
  const view = render(
    <WhenIdle timeout={100} fallback="waiting">
      ready
    </WhenIdle>,
  );

  expect(view.getByText('waiting')).toBeTruthy();
  await waitFor(() => expect(view.getByText('ready')).toBeTruthy());

  view.unmount();
});
