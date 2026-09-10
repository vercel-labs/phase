import { isDocument } from '.';

describe('isDocument', () => {
  it('identifies a Document', () => {
    expect(isDocument(document)).toBe(true);
  });

  it('rejects an Element', () => {
    expect(isDocument(document.createElement('div'))).toBe(false);
    expect(isDocument(document.documentElement)).toBe(false);
  });

  it('does not depend on scrollingElement, which jsdom omits', () => {
    expect('scrollingElement' in document).toBe(false);
    expect(isDocument(document)).toBe(true);
  });
});
