const SEMANTIC_VERSION =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const MAX_LENGTH = 256;
const MAX_NUMBER = 9007199254740991n;

function parseSemanticVersion(value) {
  if (typeof value !== 'string' || value.length > MAX_LENGTH) return;

  const match = SEMANTIC_VERSION.exec(value);
  if (!match) return;

  const prerelease = match[4]?.split('.') ?? [];
  if (
    prerelease.some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith('0'),
    )
  ) {
    return;
  }

  const release = [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])];
  if (release.some((identifier) => identifier > MAX_NUMBER)) return;

  return { release, prerelease };
}

/** Returns whether a value follows npm's semantic-version syntax and limits. */
export function isSemanticVersion(value) {
  return parseSemanticVersion(value) !== undefined;
}

/**
 * Compares valid semantic versions by precedence, ignoring build metadata.
 * Returns -1, 0, or 1 and throws when either value is invalid.
 */
export function compareSemanticVersions(left, right) {
  const a = parseSemanticVersion(left);
  const b = parseSemanticVersion(right);
  if (!a || !b) {
    throw new Error(
      `Cannot compare semantic versions because one or both values are invalid: left=${String(left)}, right=${String(right)}`,
    );
  }

  for (let index = 0; index < a.release.length; index += 1) {
    if (a.release[index] > b.release[index]) return 1;
    if (a.release[index] < b.release[index]) return -1;
  }

  if (a.prerelease.length === 0) return b.prerelease.length === 0 ? 0 : 1;
  if (b.prerelease.length === 0) return -1;

  const identifiers = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < identifiers; index += 1) {
    const leftIdentifier = a.prerelease[index];
    const rightIdentifier = b.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      return BigInt(leftIdentifier) > BigInt(rightIdentifier) ? 1 : -1;
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }

  return 0;
}
