// GitHub-style heading slugs: lowercase, strip punctuation, spaces to dashes.
export function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, '')
    .replace(/ /g, '-');
}

// Markdown headings and prose lines, excluding content inside code fences.
export function parseMarkdown(source) {
  const lines = source.split('\n');
  const anchors = new Set();
  const headings = [];
  const proseLines = [];
  let fence = null;

  function addHeading(text, level, lineIndex) {
    const base = slugify(text);
    let anchor = base;
    let suffix = 1;
    while (anchors.has(anchor)) anchor = `${base}-${suffix++}`;
    anchors.add(anchor);
    headings.push({
      anchor,
      level,
      lineIndex,
      bodyLineIndex: lineIndex + 1,
    });
  }

  for (const [lineIndex, line] of lines.entries()) {
    if (fence !== null) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
      if (
        closing &&
        closing[1][0] === fence.character &&
        closing[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }

    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      fence = { character: opening[1][0], length: opening[1].length };
      continue;
    }

    proseLines.push(line);
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)|[ \t]*)$/.exec(line);
    if (!heading) continue;

    const text = (heading[2] ?? '').replace(/[ \t]+#+[ \t]*$/, '').trim();
    if (text !== '') addHeading(text, heading[1].length, lineIndex);
  }

  return { anchors, headings, lines, proseLines };
}
