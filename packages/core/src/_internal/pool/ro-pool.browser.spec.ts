import { observeResize } from './ro-pool';

it('delivers native resize entries while subscribers remain', async () => {
  const target = document.createElement('div');
  target.style.cssText = 'width:100px;height:100px;';
  document.body.append(target);
  const first = vi.fn();
  const second = vi.fn();
  const releaseFirst = observeResize(target, first);
  const releaseSecond = observeResize(target, second);

  await vi.waitFor(() => {
    expect(first).toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
  });
  first.mockClear();
  second.mockClear();
  releaseFirst();
  target.style.width = '150px';
  await vi.waitFor(() => expect(second).toHaveBeenCalled());
  expect(first).not.toHaveBeenCalled();

  releaseSecond();
  target.remove();
});

it('replays the current native entry to a late subscriber', async () => {
  const target = document.createElement('div');
  target.style.cssText = 'width:200px;height:80px;';
  document.body.append(target);
  const first = vi.fn();
  const releaseFirst = observeResize(target, first);

  await vi.waitFor(() => expect(first).toHaveBeenCalled());
  const late = vi.fn();
  const releaseLate = observeResize(target, late);

  await vi.waitFor(() => expect(late).toHaveBeenCalledTimes(1));
  expect(late.mock.calls[0]?.[0]?.contentBoxSize[0].inlineSize).toBe(200);
  expect(late.mock.calls[0]?.[0]?.contentBoxSize[0].blockSize).toBe(80);

  releaseLate();
  releaseFirst();
  target.remove();
});
