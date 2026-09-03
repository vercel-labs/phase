import { FIX_SECTIONS } from './fix-sections.gen.ts';
import type { ScanSignal } from './signals.ts';

const REFERENCE_ROOT =
  'https://github.com/vercel-labs/phase/blob/main/skills/phase/';

export function formatSignalList(signals: readonly ScanSignal[]): string {
  const width = Math.max(...signals.map((signal) => signal.id.length));
  return signals
    .map(
      (signal) =>
        `${signal.id.padEnd(width)}  ${signal.severity}/${signal.noise}  ${signal.label}`,
    )
    .join('\n');
}

export function formatSignalExplanation(signal: ScanSignal): string {
  const section = FIX_SECTIONS[signal.fix];
  if (!section) throw new Error(`no fix section is bundled for ${signal.id}`);

  return [
    `Signal: ${signal.id}`,
    `Label: ${signal.label}`,
    `Severity: ${signal.severity}`,
    `Noise tier: ${signal.noise}`,
    `Detects: ${signal.detects}`,
    `Why: ${signal.why}`,
    `Replacement: ${signal.replacement}`,
    '',
    'Fix:',
    section,
    '',
    `Full reference: ${REFERENCE_ROOT}${signal.fix}`,
  ].join('\n');
}
