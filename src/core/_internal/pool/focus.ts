type FocusCallback = (focused: boolean) => void;

const callbacks = new Set<FocusCallback>();

function onFocusChange(): void {
  const focused: boolean = document.hasFocus();
  let firstError: unknown;
  let hasError = false;
  const currentCallbacks = Array.from(callbacks);

  for (const callback of currentCallbacks) {
    if (!callbacks.has(callback)) continue;
    try {
      callback(focused);
    } catch (error) {
      if (!hasError) {
        firstError = error;
        hasError = true;
      }
    }
  }
  if (hasError) throw firstError;
}

export function readFocus(): boolean {
  return document.hasFocus();
}

export function subscribeFocus(callback: FocusCallback): () => void {
  callbacks.add(callback);
  if (callbacks.size === 1) {
    window.addEventListener('focus', onFocusChange);
    window.addEventListener('blur', onFocusChange);
  }

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      window.removeEventListener('focus', onFocusChange);
      window.removeEventListener('blur', onFocusChange);
    }
  };
}
