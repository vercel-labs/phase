'use client';

import { usePrefersReducedMotion } from 'phase/react';

import { RendererCanvas } from './renderer-canvas';

export function Hero() {
  const reducedMotion = usePrefersReducedMotion();

  if (reducedMotion) {
    return (
      <figure aria-label="A globe showing the active regions">
        <img src="/active-regions.png" alt="North America and Europe are active" />
        <figcaption>12 active regions across North America and Europe</figcaption>
      </figure>
    );
  }

  return <RendererCanvas />;
}
