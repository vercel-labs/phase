export function watchTheme(onChange: (theme: string) => void) {
  const observer = new MutationObserver(() => {
    const dark = document.documentElement.classList.contains('dark');
    onChange(dark ? 'dark' : 'light');
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}
