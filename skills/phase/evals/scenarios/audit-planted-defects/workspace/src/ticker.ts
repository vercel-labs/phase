export function startTicker(el: HTMLElement) {
  function tick() {
    const width = el.getBoundingClientRect().width;
    el.style.transform = 'translateX(' + width / 10 + 'px)';
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
