import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'u',
  'ul',
]

const ALLOWED_ATTR = ['class', 'href', 'id', 'rel', 'target']

const EMBED_ALLOWED_TAGS = [
  ...ALLOWED_TAGS,
  'article',
  'aside',
  'audio',
  'button',
  'figcaption',
  'figure',
  'form',
  'iframe',
  'img',
  'input',
  'label',
  'option',
  'picture',
  'section',
  'select',
  'source',
  'textarea',
  'video',
]

const EMBED_ALLOWED_ATTR = [
  ...ALLOWED_ATTR,
  'accept',
  'action',
  'allow',
  'allowfullscreen',
  'alt',
  'aria-label',
  'autocomplete',
  'checked',
  'controls',
  'disabled',
  'frameborder',
  'height',
  'loading',
  'method',
  'name',
  'placeholder',
  'poster',
  'referrerpolicy',
  'required',
  'sandbox',
  'src',
  'title',
  'type',
  'value',
  'width',
]

export function sanitizeRichHtml(value?: string | null) {
  if (!value) return ''

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
  })
}

export function sanitizeRichMediaHtml(value?: string | null) {
  if (!value) return ''

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [...ALLOWED_TAGS, 'img'],
    ALLOWED_ATTR: [...ALLOWED_ATTR, 'alt', 'height', 'loading', 'src', 'title', 'width'],
    ALLOW_DATA_ATTR: false,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
  })
}

export function sanitizeEmbedHtml(value?: string | null) {
  if (!value) return ''

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: EMBED_ALLOWED_TAGS,
    ALLOWED_ATTR: EMBED_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'style', 'object', 'embed', 'base', 'link', 'meta'],
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true,
  })
}
