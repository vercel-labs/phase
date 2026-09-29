import type { ReactNode } from 'react';
import { SupportShell } from './components/support-shell';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <SupportShell />
      </body>
    </html>
  );
}
