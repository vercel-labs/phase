export function startAnimation(setProgress: (value: number) => void) {
  function loop() {
    setProgress(1);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
