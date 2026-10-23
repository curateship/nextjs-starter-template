export const PRODUCT_EMAIL_MODAL_CONTACT_SOURCE = 'Product Modal Form'
export const PRODUCT_EMAIL_MODAL_HREF = '#product-email-modal'
export const PRODUCT_EMAIL_MODAL_OPEN_EVENT = 'product-email-modal:open'

export const PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT = {
  title: 'Subscribe to our newsletter',
  description: 'Get the latest updates and news delivered to your inbox.',
  emailLabel: 'Email address',
  placeholder: 'you@example.com',
  submitButtonText: 'Subscribe',
  dismissButtonText: 'Maybe Later',
  successMessage: 'Thanks for subscribing.',
  deliveryEmailBody: '',
  openOnScroll: true,
  visibility: {},
}

export function normalizeProductEmailModalContent(content?: Record<string, any> | null) {
  const source = content && typeof content === 'object' ? content : {}
  const visibility = source.visibility && typeof source.visibility === 'object'
    ? source.visibility
    : {}

  return {
    ...PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT,
    ...source,
    title: typeof source.title === 'string' ? source.title : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.title,
    description: typeof source.description === 'string' ? source.description : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.description,
    emailLabel: typeof source.emailLabel === 'string' ? source.emailLabel : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.emailLabel,
    placeholder: typeof source.placeholder === 'string' ? source.placeholder : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.placeholder,
    submitButtonText: typeof source.submitButtonText === 'string' ? source.submitButtonText : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.submitButtonText,
    dismissButtonText: typeof source.dismissButtonText === 'string' ? source.dismissButtonText : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.dismissButtonText,
    successMessage: typeof source.successMessage === 'string' ? source.successMessage : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.successMessage,
    deliveryEmailBody: typeof source.deliveryEmailBody === 'string' ? source.deliveryEmailBody : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.deliveryEmailBody,
    openOnScroll: typeof source.openOnScroll === 'boolean' ? source.openOnScroll : PRODUCT_EMAIL_MODAL_DEFAULT_CONTENT.openOnScroll,
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

export function renderProductEmailModalTokens(
  value: string | undefined,
  productTitle: string,
  options: { html?: boolean } = {},
) {
  if (!value) return ''

  const title = options.html ? escapeHtml(productTitle) : productTitle
  return value.replaceAll('{{product_name}}', title)
}
