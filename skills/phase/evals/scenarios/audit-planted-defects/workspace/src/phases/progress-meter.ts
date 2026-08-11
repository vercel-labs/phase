export function attachMeter(el: HTMLElement) {
  let value = 0;
  function frame() {
    value = (value + 1) % 100;
    el.setAttribute('aria-valuenow', String(value));
    el.style.setProperty('--meter-value', String(value));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
