'use client';

import { useState } from 'react';
import styles from './chat-panel.module.css';

export function ChatPanel() {
  const [open, setOpen] = useState(false);

  return (
    <aside className={open ? `${styles.panel} ${styles.open}` : styles.panel}>
      <button onClick={() => setOpen((value) => !value)} type="button">
        {open ? 'Close chat' : 'Open chat'}
      </button>
      <div className={styles.content}>How can we help?</div>
    </aside>
  );
}
