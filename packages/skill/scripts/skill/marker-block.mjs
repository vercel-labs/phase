function locateMarkerBlock(source, name, { fence } = {}) {
  const begin = `<!-- ${name}:begin -->`;
  const end = `<!-- ${name}:end -->`;
  const beginIndex = source.indexOf(begin);
  const endIndex = source.indexOf(end);

  if (
    beginIndex === -1 ||
    endIndex === -1 ||
    endIndex < beginIndex ||
    source.indexOf(begin, beginIndex + begin.length) !== -1 ||
    source.indexOf(end, endIndex + end.length) !== -1
  ) {
    throw new Error(`Missing or duplicate ${name} marker block.`);
  }

  let contentStart = beginIndex + begin.length;
  if (source[contentStart] !== '\n') {
    throw new Error(`${name} begin marker must be followed by a newline.`);
  }
  contentStart++;

  let contentEnd = endIndex;
  if (fence) {
    const opening =
      source[contentStart] === '\n' ? `\n${fence}\n` : `${fence}\n`;
    const closing =
      source[endIndex - 1] === '\n' && source[endIndex - 2] === '\n'
        ? `${fence}\n\n`
        : `${fence}\n`;
    if (!source.startsWith(opening, contentStart)) {
      throw new Error(`${name} block is missing its opening fence.`);
    }
    contentStart += opening.length;
    contentEnd -= closing.length;
    if (contentEnd < contentStart || !source.startsWith(closing, contentEnd)) {
      throw new Error(`${name} block is missing its closing fence.`);
    }
  } else {
    if (source[contentStart] === '\n') contentStart++;
    if (source[endIndex - 1] === '\n' && source[endIndex - 2] === '\n') {
      contentEnd--;
    }
  }

  return { contentStart, contentEnd };
}

/**
 * Reads the content between one named pair of HTML comment markers.
 * When `options.fence` is set, the markers must contain a matching fenced block.
 * Throws when markers are missing, duplicated, out of order, or malformed.
 */
export function readMarkerBlock(source, name, options) {
  const { contentStart, contentEnd } = locateMarkerBlock(source, name, options);
  return source.slice(contentStart, contentEnd);
}

/**
 * Replaces one marker block's content while preserving its markers and framing whitespace.
 * Fenced replacements reject content containing the closing fence to prevent truncation.
 */
export function replaceMarkerBlock(source, name, content, options = {}) {
  if (options.fence && content.includes(options.fence)) {
    throw new Error(`${name} content contains the closing fence.`);
  }
  const { contentStart, contentEnd } = locateMarkerBlock(source, name, options);
  return source.slice(0, contentStart) + content + source.slice(contentEnd);
}
