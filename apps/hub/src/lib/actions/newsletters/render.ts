import { extractSponsorIdsFromHtml, splitSponsorEmbeds } from '@/lib/utils/sponsor-embeds'
import { sanitizeUrl } from '@/lib/utils/url-validator'

export interface NewsletterRenderBlock {
  id: string
  type: string
  title?: string
  content: Record<string, any>
}

export interface NewsletterRenderSponsor {
  id: string
  title: string
  description?: string | null
  image_url?: string | null
  url: string
}

interface NewsletterRenderOptions {
  sponsorsById?: Record<string, NewsletterRenderSponsor>
}

export const DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR = '#fafafa'

export function normalizeNewsletterRichTextHtml(htmlContent: string): string {
  return htmlContent
    .replace(/<p(?:\s[^>]*)?>\s*(?:&nbsp;|\u00a0|<br[^>]*>)?\s*<\/p>/gi, '')
    .trim()
}

function normalizeNewsletterImageBorderColor(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR

  const trimmedValue = value.trim()
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmedValue)
    ? trimmedValue
    : DEFAULT_NEWSLETTER_IMAGE_BORDER_COLOR
}

function normalizeNewsletterImageBorderSize(value: unknown): number {
  const parsedValue = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsedValue)) return 0
  return Math.max(0, Math.min(48, Math.round(parsedValue)))
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function mergeStyleStrings(currentStyles: string, extraStyles: string): string {
  const styles = new Map<string, string>()

  for (const styleString of [currentStyles, extraStyles]) {
    for (const declaration of styleString.split(';')) {
      const trimmedDeclaration = declaration.trim()
      if (!trimmedDeclaration) continue

      const separatorIndex = trimmedDeclaration.indexOf(':')
      if (separatorIndex === -1) continue

      const property = trimmedDeclaration.slice(0, separatorIndex).trim().toLowerCase()
      const value = trimmedDeclaration.slice(separatorIndex + 1).trim()
      if (!property || !value) continue
      styles.set(property, value)
    }
  }

  return Array.from(styles.entries())
    .map(([property, value]) => `${property}:${value}`)
    .join(';')
    .concat(styles.size ? ';' : '')
}

function mergeInlineStyles(openingTag: string, extraStyles: string): string {
  const normalizedExtraStyles = extraStyles.trim()

  if (/style=/i.test(openingTag)) {
    return openingTag.replace(/style=(['"])(.*?)\1/i, (_match, quote, currentStyles) => {
      return `style=${quote}${mergeStyleStrings(currentStyles, normalizedExtraStyles)}${quote}`
    })
  }

  return openingTag.replace(/>$/, ` style="${mergeStyleStrings('', normalizedExtraStyles)}">`)
}

function styleOpeningTags(html: string, tagName: string, styles: string): string {
  return html.replace(new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi'), (match) => mergeInlineStyles(match, styles))
}

function getRichTextImageStyles(content: Record<string, any>): string {
  const imageBorderSize = normalizeNewsletterImageBorderSize(content.imageBorderSize)
  const imageBorderColor = normalizeNewsletterImageBorderColor(content.imageBorderColor)
  const frameStyles = imageBorderSize > 0
    ? `padding:${imageBorderSize}px;background-color:${imageBorderColor};`
    : 'padding:0;background-color:transparent;'

  return `display:block;max-width:100%;height:auto;margin:0 auto 24px auto;box-sizing:border-box;border:0;border-radius:8px;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;${frameStyles}`
}

function renderSponsorEmailHtml(sponsor: NewsletterRenderSponsor): string {
  const href = sanitizeUrl(sponsor.url, '#')
  const imageSrc = sanitizeUrl(sponsor.image_url, '')
  const imageHtml = imageSrc
    ? `<td width="88" valign="middle" style="padding:0 16px 0 0;"><img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(sponsor.title)}" width="88" style="display:block;width:88px;max-width:88px;height:auto;border:0;outline:none;text-decoration:none;" /></td>`
    : ''
  const descriptionHtml = sponsor.description
    ? `<div style="margin-top:4px;font-size:14px;line-height:1.4;color:#4b5563;">${escapeHtml(sponsor.description)}</div>`
    : ''

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td><a href="${escapeHtml(href)}" target="_blank" rel="sponsored noopener noreferrer" style="display:block;color:#111827;text-decoration:none;border:1px solid #e5e7eb;border-radius:8px;background-color:#ffffff;padding:16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${imageHtml}<td valign="middle" style="padding:0;"><div style="font-size:12px;line-height:1.2;font-weight:700;text-transform:uppercase;color:#6b7280;">Sponsored</div><div style="margin-top:4px;font-size:16px;line-height:1.35;font-weight:700;color:#111827;">${escapeHtml(sponsor.title)}</div>${descriptionHtml}</td></tr></table></a></td></tr></table>`
}

function renderSponsorEmbeds(html: string, options?: NewsletterRenderOptions): string {
  return splitSponsorEmbeds(html)
    .map((part) => {
      if (part.type === 'html') return part.html
      const sponsor = options?.sponsorsById?.[part.sponsorId]
      return sponsor ? renderSponsorEmailHtml(sponsor) : ''
    })
    .join('')
}

export function extractNewsletterSponsorIds(blocks: NewsletterRenderBlock[]) {
  return Array.from(new Set(blocks.flatMap((block) => (
    block.type === 'newsletter-rich-text'
      ? extractSponsorIdsFromHtml(block.content?.htmlContent || '')
      : []
  ))))
}

function styleRichTextHtml(htmlContent: string, content: Record<string, any>): string {
  let styledContent = normalizeNewsletterRichTextHtml(htmlContent)

  styledContent = styleOpeningTags(styledContent, 'h1', 'margin:0 0 16px 0;padding-top:7px;font-size:32px;line-height:1.2;font-weight:700;color:#111827;font-family:Arial,sans-serif;')
  styledContent = styleOpeningTags(styledContent, 'h2', 'margin:0 0 16px 0;padding-top:7px;font-size:28px;line-height:1.25;font-weight:700;color:#111827;font-family:Arial,sans-serif;')
  styledContent = styleOpeningTags(styledContent, 'h3', 'margin:0 0 14px 0;padding-top:7px;font-size:22px;line-height:1.3;font-weight:700;color:#111827;font-family:Arial,sans-serif;')
  styledContent = styleOpeningTags(styledContent, 'h4', 'margin:0 0 12px 0;padding-top:7px;font-size:18px;line-height:1.35;font-weight:700;color:#111827;font-family:Arial,sans-serif;')
  styledContent = styleOpeningTags(styledContent, 'h5', 'margin:0 0 10px 0;padding-top:7px;font-size:16px;line-height:1.4;font-weight:700;color:#111827;font-family:Arial,sans-serif;')
  styledContent = styleOpeningTags(styledContent, 'h6', 'margin:0 0 10px 0;padding-top:7px;font-size:14px;line-height:1.4;font-weight:700;color:#111827;font-family:Arial,sans-serif;')
  styledContent = styleOpeningTags(styledContent, 'p', 'margin:0 0 24px 0;')
  styledContent = styleOpeningTags(styledContent, 'ul', 'margin:0 0 16px 0;padding-left:24px;list-style-type:disc;list-style-position:outside;')
  styledContent = styleOpeningTags(styledContent, 'ol', 'margin:0 0 16px 0;padding-left:24px;list-style-type:decimal;list-style-position:outside;')
  styledContent = styleOpeningTags(styledContent, 'li', 'margin:0 0 4px 0;')
  styledContent = styleOpeningTags(styledContent, 'a', 'color:#2563eb;text-decoration:underline;')
  styledContent = styleOpeningTags(styledContent, 'blockquote', 'margin:0 0 24px 0;padding-left:16px;border-left:4px solid #e5e7eb;color:#4b5563;')
  styledContent = styleOpeningTags(styledContent, 'img', getRichTextImageStyles(content))

  return styledContent.replace(/<li([^>]*)>\s*<p([^>]*)>/gi, (_match, liAttributes = '', paragraphAttributes = '') => {
    return `<li${liAttributes}><p${paragraphAttributes}>`.replace(/<p([^>]*)>/i, (paragraphTag) => mergeInlineStyles(paragraphTag, 'margin:0;'))
  })
}

export function renderNewsletterBlockHtml(block: NewsletterRenderBlock, options?: NewsletterRenderOptions): string {
  switch (block.type) {
    case 'newsletter-header': {
      const {
        logoUrl,
        alignment = 'center',
        backgroundColor = '#ffffff',
        paddingTop,
        paddingBottom,
        padding = 20,
      } = block.content
      const pTop = paddingTop ?? padding
      const pBottom = paddingBottom ?? padding
      const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'
      let inner = ''

      if (logoUrl) {
        const logoW = block.content.logoWidth || 100
        const logoH = block.content.logoHeight
        inner += `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:${logoW}px;height:${logoH ? `${logoH}px` : 'auto'};display:block;margin:0 ${align === 'center' ? 'auto' : '0'};" />`
      }

      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${escapeHtml(backgroundColor)};"><tr><td style="padding:${pTop}px 20px ${pBottom}px 20px;text-align:${align};">${inner}</td></tr></table>`
    }

    case 'newsletter-rich-text': {
      const { htmlContent = '', backgroundColor = '#ffffff', padding = 20 } = block.content
      const styledContent = renderSponsorEmbeds(styleRichTextHtml(htmlContent, block.content), options)
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${escapeHtml(backgroundColor)};"><tr><td style="padding:${padding}px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#333333;">${styledContent}</td></tr></table>`
    }

    case 'newsletter-divider': {
      const { color = '#e5e7eb', thickness = 1, width = 100, spacing = 20 } = block.content
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${spacing}px 0;text-align:center;"><hr style="border:none;border-top:${thickness}px solid ${escapeHtml(color)};width:${width}%;margin:0 auto;" /></td></tr></table>`
    }

    case 'newsletter-footer': {
      const { companyName = '', companyAddress = '', alignment = 'center' } = block.content
      const showUnsubscribe = block.content.visibility?.showUnsubscribe !== false
      const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'
      let inner = ''

      if (companyName) inner += `<p style="margin:0 0 4px 0;font-weight:bold;">${escapeHtml(companyName)}</p>`
      if (companyAddress) inner += `<p style="margin:0 0 12px 0;" class="unstyle-auto-detected-links">${escapeHtml(companyAddress)}</p>`
      if (showUnsubscribe) inner += `<p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#999999;text-decoration:underline;">Unsubscribe</a></p>`

      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:20px;text-align:${align};font-family:Arial,sans-serif;font-size:12px;color:#999999;">${inner}</td></tr></table>`
    }

    default:
      return ''
  }
}

export function generateEmailHtml(blocks: NewsletterRenderBlock[], maxWidth: number = 600, options?: NewsletterRenderOptions): string {
  const wrappedBlocks = blocks
    .map((block) => renderNewsletterBlockHtml(block, options))
    .map((blockHtml) => `<tr><td>${blockHtml}</td></tr>`)
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="format-detection" content="address=no"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>@media only screen and (max-width:${maxWidth + 20}px){.email-container{width:100%!important;}}.unstyle-auto-detected-links a[x-apple-data-detectors],.unstyle-auto-detected-links a{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}</style></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;"><center><!--[if mso]><table role="presentation" width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]--><table role="presentation" class="email-container" width="${maxWidth}" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">${wrappedBlocks}</table><!--[if mso]></td></tr></table><![endif]--></center></body></html>`
}
