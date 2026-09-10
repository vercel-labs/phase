const DOCUMENT_NODE = 9;

/**
 * Discriminates a page target from an element target.
 *
 * Uses `nodeType` rather than a property check: `document.scrollingElement` is
 * absent in some test DOMs, so feature detection would silently classify a
 * Document as an Element.
 */
export function isDocument(target: Element | Document): target is Document {
  return target.nodeType === DOCUMENT_NODE;
}
