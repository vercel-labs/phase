'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function RootLayout({ children }: { children: ReactNode }) {
  const headerRef = useRef<HTMLElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    function handleScroll() {
      const height = headerRef.current?.getBoundingClientRect().height ?? 0;
      setCompact(window.scrollY > height);
    }

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <html>
      <body>
        <header ref={headerRef} data-compact={compact || undefined}>
          Product
        </header>
        {children}
      </body>
    </html>
  );
}
