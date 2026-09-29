import type { ReactNode } from 'react';
import { ChatPanel } from './components/chat-panel';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <div>{children}</div>
        <ChatPanel />
      </body>
    </html>
  );
}
