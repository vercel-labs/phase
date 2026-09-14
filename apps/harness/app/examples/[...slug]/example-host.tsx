'use client';

import { useEffect, useRef, type JSX, type ReactNode } from 'react';

type ExampleHostProps = {
  children: ReactNode;
  slug: string;
};

export function ExampleHost({ children, slug }: ExampleHostProps): JSX.Element {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    root.dataset.hydrated = 'true';
    return () => {
      delete root.dataset.hydrated;
    };
  }, []);

  return (
    <main ref={rootRef} data-example-slug={slug}>
      <div aria-hidden="true" style={{ height: '150vh' }} />
      {children}
      <div aria-hidden="true" style={{ height: '150vh' }} />
    </main>
  );
}
