export const PRODUCT_LEAD_MAGNET_DEFAULT_CONTENT = {
  body: '',
  formPlaceholder: 'Enter your email',
  buttonText: 'Send it to me',
  redirectUrl: '',
  deliveryEmailBody: '',
  visibility: {},
}

export function normalizeProductLeadMagnetContent(content?: Record<string, any> | null) {
  const source = content && typeof content === 'object' ? content : {}
  const visibility = source.visibility && typeof source.visibility === 'object'
    ? source.visibility
    : {}

  return {
    ...PRODUCT_LEAD_MAGNET_DEFAULT_CONTENT,
    ...source,
    body: typeof source.body === 'string'
      ? source.body
      : typeof source.content === 'string'
        ? source.content
        : PRODUCT_LEAD_MAGNET_DEFAULT_CONTENT.body,
    formPlaceholder: typeof source.formPlaceholder === 'string'
      ? source.formPlaceholder
      : PRODUCT_LEAD_MAGNET_DEFAULT_CONTENT.formPlaceholder,
    buttonText: typeof source.buttonText === 'string'
      ? source.buttonText
      : PRODUCT_LEAD_MAGNET_DEFAULT_CONTENT.buttonText,
    redirectUrl: typeof source.redirectUrl === 'string' ? source.redirectUrl : '',
    deliveryEmailBody: typeof source.deliveryEmailBody === 'string'
      ? source.deliveryEmailBody
      : PRODUCT_LEAD_MAGNET_DEFAULT_CONTENT.deliveryEmailBody,
    visibility,
  }
}

function escapeHtml(value: string) {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return value.replace(/[&<>"']/g, (char) => map[char])
}

export function renderProductLeadMagnetTokens(
  value: string | undefined,
  productTitle: string,
  options: { html?: boolean } = {},
) {
  if (!value) return ''

  const title = options.html ? escapeHtml(productTitle) : productTitle
  return value.replaceAll('{{product_name}}', title)
}
