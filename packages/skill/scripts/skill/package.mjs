#!/usr/bin/env node

/**
 * Packages consumer-facing files from skills/phase/ into
 * dist/phase-skill.zip for direct download.
 *
 * Produces a deterministic, store-only (uncompressed) archive: files are sorted
 * and all timestamps are zeroed, so the same sources always yield byte-identical
 * output on any OS or Node version. This lets CI verify the committed zip is
 * fresh via `git diff` without spurious failures.
 *
 * Zero dependencies — uses only Node built-ins.
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const skillDir = join(repoRoot, 'skills', 'phase');
const distDir = join(skillDir, 'dist');
const outPath = join(distDir, 'phase-skill.zip');

mkdirSync(distDir, { recursive: true });

// Collect consumer-facing reference files recursively. Top-level skill files
// and the audit scanner are allowlisted below so contributor tooling cannot be
// added to the archive accidentally.
function collectFiles(dir, base) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('_')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push(relative(base, full).split(sep).join('/'));
    }
  }
  return results;
}

// Deterministic store-only zip (no compression, universally extractable).
function storeZip() {
  const files = [
    'metadata.json',
    'README.md',
    'SKILL.md',
    'scripts/scan.mjs',
    ...collectFiles(join(skillDir, 'references'), skillDir),
  ].toSorted();
  const entries = [];

  for (const rel of files) {
    const data = readFileSync(join(skillDir, rel));
    const nameBuffer = Buffer.from(rel, 'utf8');

    // Local file header
    const header = Buffer.alloc(30 + nameBuffer.length);
    header.writeUInt32LE(0x04034b50, 0); // signature
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(0, 8); // compression (store)
    header.writeUInt16LE(0, 10); // mod time
    header.writeUInt16LE(0, 12); // mod date
    header.writeUInt32LE(crc32(data), 14); // crc32
    header.writeUInt32LE(data.length, 18); // compressed size
    header.writeUInt32LE(data.length, 22); // uncompressed size
    header.writeUInt16LE(nameBuffer.length, 26); // filename length
    header.writeUInt16LE(0, 28); // extra field length
    nameBuffer.copy(header, 30);

    entries.push({ header, data, name: nameBuffer, offset: 0 });
  }

  // Calculate offsets
  let offset = 0;
  for (const entry of entries) {
    entry.offset = offset;
    offset += entry.header.length + entry.data.length;
  }

  // Central directory
  const centralEntries = [];
  for (const entry of entries) {
    const cd = Buffer.alloc(46 + entry.name.length);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // compression
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0, 14); // mod date
    cd.writeUInt32LE(entry.header.readUInt32LE(14), 16); // crc32
    cd.writeUInt32LE(entry.data.length, 20); // compressed
    cd.writeUInt32LE(entry.data.length, 24); // uncompressed
    cd.writeUInt16LE(entry.name.length, 28); // filename length
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk start
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(entry.offset, 42); // local header offset
    entry.name.copy(cd, 46);
    centralEntries.push(cd);
  }

  const centralDir = Buffer.concat(centralEntries);
  const centralDirOffset = offset;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // disk with cd
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment

  const buffers = [];
  for (const entry of entries) {
    buffers.push(entry.header, entry.data);
  }
  buffers.push(centralDir, eocd);

  writeFileSync(outPath, Buffer.concat(buffers));
}

// Per-file checksum the ZIP format requires so extractors can detect corruption.
/* oxlint-disable no-bitwise -- CRC-32 is inherently bitwise */
function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/* oxlint-enable no-bitwise */

// --- Run ---

storeZip();

console.log(`✓ ${outPath}`);
