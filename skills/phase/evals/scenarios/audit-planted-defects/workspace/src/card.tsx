import type { ReactNode } from 'react';

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border transition-all duration-300 hover:shadow-lg">
      {children}
    </div>
  );
}
