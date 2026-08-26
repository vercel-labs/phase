'use client';

import { Presence } from 'phase/react';
import { useState, type JSX } from 'react';

const styles = `
.phx-presence-basic {
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  min-height: 180px;
  padding: 20px;
  border: 1px solid #fbcfe8;
  border-radius: 16px;
  background: #fdf2f8;
  color: #500724;
  font: 14px/1.5 ui-sans-serif, system-ui, sans-serif;
}
.phx-presence-basic button {
  margin-bottom: 16px;
  padding: 8px 12px;
  border: 0;
  border-radius: 999px;
  background: #be185d;
  color: white;
  cursor: pointer;
  font: inherit;
}
.phx-presence-basic-card {
  padding: 20px;
  border-radius: 12px;
  background: #fbcfe8;
  transition: opacity 200ms ease, transform 200ms ease;
}
.phx-presence-basic-card[data-phase='exiting'] {
  opacity: 0;
  transform: translateY(8px);
}
@starting-style {
  .phx-presence-basic-card[data-enter='animate'] {
    opacity: 0;
    transform: translateY(8px);
  }
}
`;

export default function PresenceBasic(): JSX.Element {
  const [visible, setVisible] = useState(true);

  return (
    <section className="phx-presence-basic">
      <style>{styles}</style>
      <button type="button" onClick={() => setVisible((current) => !current)}>
        {visible ? 'Hide message' : 'Show message'}
      </button>
      <Presence
        show={visible}
        exitDuration={250}
        className="phx-presence-basic-card"
      >
        Presence keeps this message on the page until its exit animation
        finishes.
      </Presence>
    </section>
  );
}
