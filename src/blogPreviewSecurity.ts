const ALLOWED_TAGS = new Set([
  'a', 'article', 'aside', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup',
  'dd', 'details', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'img', 'li', 'main',
  'mark', 'nav', 'ol', 'p', 'pre', 'section', 'small', 'span', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'tr', 'u', 'ul',
]);

const DROP_WITH_CONTENT = new Set([
  'base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'meta', 'object',
  'script', 'select', 'style', 'textarea',
]);

const GLOBAL_ATTRIBUTES = new Set(['aria-label', 'class', 'dir', 'lang', 'role', 'title']);
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href']),
  col: new Set(['span']),
  img: new Set(['alt', 'height', 'loading', 'src', 'width']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
};

const safeHttpsUrl = (value: string) => {
  try {
    return new URL(value, 'https://preview.invalid').protocol === 'https:';
  } catch {
    return false;
  }
};

const safeImageUrl = (value: string) => (
  safeHttpsUrl(value)
  || /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value)
);

const fallbackSanitize = (html: string) => String(html || '')
  .replace(/<(script|style|iframe|object|embed|form|button|input|textarea|select|link|meta|base)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  .replace(/<(script|style|iframe|object|embed|form|button|input|textarea|select|link|meta|base)\b[^>]*\/?>/gi, '')
  .replace(/\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/\s+(?:srcdoc|style)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript|vbscript):[\s\S]*?\2/gi, '');

export const sanitizeBlogPreviewHtml = (html: string): string => {
  const source = String(html || '');
  if (typeof DOMParser === 'undefined') return fallbackSanitize(source);

  const document = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  for (const element of Array.from(document.body.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tag)) {
      element.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const allowedForTag = TAG_ATTRIBUTES[tag] || new Set<string>();
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!GLOBAL_ATTRIBUTES.has(name) && !allowedForTag.has(name)) {
        element.removeAttribute(attribute.name);
      }
    }

    if (tag === 'a') {
      const href = element.getAttribute('href') || '';
      if (!safeHttpsUrl(href)) element.removeAttribute('href');
      else {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (tag === 'img') {
      const src = element.getAttribute('src') || '';
      if (!safeImageUrl(src)) element.removeAttribute('src');
      element.setAttribute('loading', 'lazy');
    }
  }
  return document.body.innerHTML;
};
