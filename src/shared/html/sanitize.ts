/**
 * Lightweight sanitizer for HTML snippets produced by app-internal formatters.
 * Strips script/style/iframe/object/embed/link/meta tags and inline event handlers.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return input;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return '';

  const blocked = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta'];
  blocked.forEach((tag) => {
    root.querySelectorAll(tag).forEach((node) => node.remove());
  });

  root.querySelectorAll('*').forEach((el) => {
    for (let i = el.attributes.length - 1; i >= 0; i--) {
      const attr = el.attributes.item(i);
      if (!attr) continue;
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  return root.innerHTML;
}
