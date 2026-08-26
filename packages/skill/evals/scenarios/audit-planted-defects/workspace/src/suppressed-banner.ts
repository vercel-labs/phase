export function startBanner(el: HTMLElement) {
  requestAnimationFrame(() => el.classList.add('banner-in'));

  // phase-scan-ignore forced-reflow
  const width = el.offsetWidth;
  return width;
}
