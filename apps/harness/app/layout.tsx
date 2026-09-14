import type { Metadata } from 'next';
import type { JSX, ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Phase runtime harness',
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
