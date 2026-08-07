export function startBanner(el: HTMLElement) {
  // phase-scan-ignore manual-raf -- accepted: one-shot class toggle, replaced in #142
  requestAnimationFrame(() => el.classList.add('banner-in'));

  // phase-scan-ignore forced-reflow
  const width = el.offsetWidth;
  return width;
}
