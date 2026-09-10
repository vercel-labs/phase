import { createRenderState } from '.';

it('tracks native content-visibility state changes', async () => {
  const spacer = document.createElement('div');
  const target = document.createElement('div');
  spacer.style.height = '2000px';
  target.style.cssText =
    'content-visibility:auto;contain-intrinsic-size:100px;height:100px;';
  const renderState = createRenderState({
    target,
  });
  document.body.append(spacer, target);

  await vi.waitFor(() => expect(renderState.phase).toBe('skipped'));
  target.scrollIntoView();
  await vi.waitFor(() => expect(renderState.phase).toBe('rendered'));

  renderState.stop();
  spacer.remove();
  target.remove();
  window.scrollTo(0, 0);
});
