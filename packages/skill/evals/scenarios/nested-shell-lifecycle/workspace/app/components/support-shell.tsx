'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import styles from './support-shell.module.css';

const AmbientCanvas = dynamic(
  () => import('./ambient-canvas').then((module) => module.AmbientCanvas),
  { ssr: false },
);

export function SupportShell() {
  const [open, setOpen] = useState(false);

  return (
    <section>
      <button onClick={() => setOpen((value) => !value)} type="button">
        {open ? 'Close support' : 'Open support'}
      </button>
      <aside className={open ? styles.open : styles.closed}>
        <AmbientCanvas />
      </aside>
    </section>
  );
}
