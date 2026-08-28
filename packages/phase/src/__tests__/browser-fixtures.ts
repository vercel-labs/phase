export interface ScrollFixture {
  root: HTMLDivElement;
  target: HTMLDivElement;
  cleanup(): void;
}

export function createScrollFixture(options?: {
  rootSize?: number;
  targetSize?: number;
  beforeSize?: number;
}): ScrollFixture {
  const rootSize = options?.rootSize ?? 100;
  const targetSize = options?.targetSize ?? 100;
  const beforeSize = options?.beforeSize ?? 150;
  const root = document.createElement('div');
  const before = document.createElement('div');
  const target = document.createElement('div');
  const after = document.createElement('div');

  root.style.cssText = `width:${rootSize}px;height:${rootSize}px;overflow:auto;position:relative;`;
  before.style.height = `${beforeSize}px`;
  target.style.cssText = `width:${rootSize}px;height:${targetSize}px;`;
  after.style.height = `${rootSize}px`;
  root.append(before, target, after);
  document.body.append(root);

  return {
    root,
    target,
    cleanup() {
      root.remove();
    },
  };
}
