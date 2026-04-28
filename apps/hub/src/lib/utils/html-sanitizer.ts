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

const ALLOWED_ATTR = ['class', 'href', 'rel', 'target']

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
