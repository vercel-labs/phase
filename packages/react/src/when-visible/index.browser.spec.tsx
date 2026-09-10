import { act, render, waitFor } from '@testing-library/react';

import { WhenVisible } from '.';

it('mounts once a native intersection reaches the sentinel', async () => {
  const root = document.createElement('div');
  const before = document.createElement('div');
  const mount = document.createElement('div');
  root.style.cssText = 'width:100px;height:100px;overflow:auto;';
  before.style.height = '150px';
  root.append(before, mount);
  document.body.append(root);
  const view = render(
    <WhenVisible root={root} rootMargin="0px" fallback="waiting">
      ready
    </WhenVisible>,
    { container: mount },
  );

  expect(view.getByText('waiting')).toBeTruthy();
  act(() => {
    root.scrollTop = 150;
  });
  await waitFor(() => expect(view.getByText('ready')).toBeTruthy());

  view.unmount();
  root.remove();
});
