import { readMarkerBlock } from './marker-block.mjs';

const HEADERS = ['Signal', 'Severity', 'Noise', 'Detects', 'Fix reference'];

/** Returns whether audit.md's generated signal table exactly matches the catalog. */
export function isSignalTableFresh(source, signals, severityOrder) {
  return (
    readMarkerBlock(source, 'signal-table') ===
    renderSignalTable(signals, severityOrder)
  );
}

/**
 * Renders signal catalog metadata as a padded Markdown table.
 * Signals retain catalog order unless a severity order is provided.
 */
export function renderSignalTable(signals, severityOrder) {
  const ordered = severityOrder
    ? [...signals].toSorted(
        (a, b) =>
          severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
      )
    : signals;
  const rows = ordered.map((signal) => [
    `\`${signal.id}\``,
    signal.severity,
    signal.noise,
    signal.detects.replaceAll('|', '\\|'),
    fixLink(signal.fix),
  ]);
  const widths = HEADERS.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length)),
  );
  const renderRow = (row) =>
    `| ${row.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
  const separator = widths.map((width) => '-'.repeat(width));

  return `${[
    renderRow(HEADERS),
    renderRow(separator),
    ...rows.map(renderRow),
  ].join('\n')}\n`;
}

function fixLink(fix) {
  const target = fix.slice('references/'.length);
  const [file, anchor] = target.split('#');
  const href = file === 'audit.md' ? '' : `./${file}`;
  return `[${file}](${href}${anchor ? `#${anchor}` : ''})`;
}
