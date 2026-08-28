import { createMutation } from '.';
import { createScrollFixture } from '../../__tests__/browser-fixtures';

it('coalesces native mutation records on an animation frame', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  const batches: MutationRecord[][] = [];
  const mutation = createMutation({
    target,
    mutation: { childList: true },
    visibility: 'ignore',
    onMutations: (records) => batches.push(records),
  });

  target.append(document.createElement('span'));
  await Promise.resolve();
  target.append(document.createElement('span'));

  await vi.waitFor(() => expect(batches).toHaveLength(1));
  expect(batches[0]).toHaveLength(2);

  mutation.stop();
  target.remove();
});

it('drops native records after teardown', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  const callback = vi.fn();
  const mutation = createMutation({
    target,
    mutation: { childList: true },
    visibility: 'ignore',
    onMutations: callback,
  });

  mutation.stop();
  target.append(document.createElement('span'));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  expect(callback).not.toHaveBeenCalled();
  target.remove();
});

it('strong-pauses native mutation delivery while off-screen', async () => {
  const fixture = createScrollFixture();
  const callback = vi.fn();
  const mutation = createMutation({
    target: fixture.target,
    mutation: { childList: true },
    intersectionOptions: { root: fixture.root },
    onMutations: callback,
  });

  await vi.waitFor(() => expect(mutation.phase).toBe('paused'));
  fixture.root.scrollTop = 150;
  await vi.waitFor(() => expect(mutation.phase).toBe('observing'));
  fixture.target.append(document.createElement('span'));
  await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

  fixture.root.scrollTop = 0;
  await vi.waitFor(() => expect(mutation.phase).toBe('paused'));
  fixture.target.append(document.createElement('span'));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(callback).toHaveBeenCalledTimes(1);

  mutation.stop();
  fixture.cleanup();
});
