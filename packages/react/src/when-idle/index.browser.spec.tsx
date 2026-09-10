import { render, waitFor } from '@testing-library/react';

import { WhenIdle } from '.';

it('mounts after the browser idle scheduling path runs', async () => {
  const view = render(
    <WhenIdle data-testid="when-idle" timeout={100} fallback="waiting">
      ready
    </WhenIdle>,
  );

  expect(view.getByText('waiting')).toBeTruthy();
  await waitFor(() => expect(view.getByText('ready')).toBeTruthy());
  expect(view.getByTestId('when-idle').dataset.phase).toBe('entered');
  expect(view.getByTestId('when-idle').dataset.enter).toBeUndefined();

  view.unmount();
});
