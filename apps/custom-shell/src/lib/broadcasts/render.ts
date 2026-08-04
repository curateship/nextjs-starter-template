import {
  ACTION_URL_TOKEN,
  safeLinkUrl,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import { escapeHtml } from "@/lib/escape-html"

/**
 * Renders broadcast blocks into table-based, inline-styled email HTML that
 * survives Outlook (MSO) and Gmail. Personalization tokens ({{firstName}},
 * {{lastName}}, {{email}}, {{unsubscribe_url}}) are left in place — the send
 * loop replaces them per recipient with HTML-escaped values.
 */

const EMAIL_MAX_WIDTH = 600

function mergeStyleStrings(currentStyles: string, extraStyles: string) {
  const styles = new Map<string, string>()
  for (const styleString of [currentStyles, extraStyles]) {
    for (const declaration of styleString.split(";")) {
      const trimmed = declaration.trim()
      if (!trimmed) continue
      const separator = trimmed.indexOf(":")
      if (separator === -1) continue
      const property = trimmed.slice(0, separator).trim().toLowerCase()
      const value = trimmed.slice(separator + 1).trim()
      if (!property || !value) continue
      styles.set(property, value)
    }
  }
  return Array.from(styles.entries())
    .map(([property, value]) => `${property}:${value}`)
    .join(";")
    .concat(styles.size ? ";" : "")
}

function mergeInlineStyles(openingTag: string, extraStyles: string) {
  const normalized = extraStyles.trim()
  if (/style=/i.test(openingTag)) {
    return openingTag.replace(
      /style=(['"])(.*?)\1/i,
      (_match, quote, currentStyles) =>
        `style=${quote}${mergeStyleStrings(currentStyles, normalized)}${quote}`
    )
  }
  return openingTag.replace(
    />$/,
    ` style="${mergeStyleStrings("", normalized)}">`
  )
}

function styleOpeningTags(html: string, tagName: string, styles: string) {
  return html.replace(new RegExp(`<${tagName}(\\s[^>]*)?>`, "gi"), (match) =>
    mergeInlineStyles(match, styles)
  )
}

const RICH_TEXT_TAG_STYLES: Array<[string, string]> = [
  [
    "h1",
    "margin:0 0 16px 0;padding-top:7px;font-size:32px;line-height:1.2;font-weight:700;color:#111827;font-family:Arial,sans-serif;",
  ],
  [
    "h2",
    "margin:0 0 16px 0;padding-top:7px;font-size:28px;line-height:1.25;font-weight:700;color:#111827;font-family:Arial,sans-serif;",
  ],
  [
    "h3",
    "margin:0 0 14px 0;padding-top:7px;font-size:22px;line-height:1.3;font-weight:700;color:#111827;font-family:Arial,sans-serif;",
  ],
  [
    "h4",
    "margin:0 0 12px 0;padding-top:7px;font-size:18px;line-height:1.35;font-weight:700;color:#111827;font-family:Arial,sans-serif;",
  ],
  ["p", "margin:0 0 24px 0;"],
  [
    "ul",
    "margin:0 0 16px 0;padding-left:24px;list-style-type:disc;list-style-position:outside;",
  ],
  [
    "ol",
    "margin:0 0 16px 0;padding-left:24px;list-style-type:decimal;list-style-position:outside;",
  ],
  ["li", "margin:0 0 4px 0;"],
  ["a", "color:#2563eb;text-decoration:underline;"],
  [
    "blockquote",
    "margin:0 0 24px 0;padding-left:16px;border-left:4px solid #e5e7eb;color:#4b5563;",
  ],
  [
    "img",
    "display:block;max-width:100%;height:auto;margin:0 auto 24px auto;box-sizing:border-box;border:0;border-radius:8px;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;",
  ],
]

function normalizeRichTextHtml(htmlContent: string) {
  return htmlContent
    .replace(/<p(?:\s[^>]*)?>\s*(?:&nbsp;|\u00a0|<br[^>]*>)?\s*<\/p>/gi, "")
    .trim()
}

function styleRichTextHtml(htmlContent: string) {
  let styled = normalizeRichTextHtml(htmlContent)
  for (const [tag, styles] of RICH_TEXT_TAG_STYLES) {
    styled = styleOpeningTags(styled, tag, styles)
  }
  // Paragraphs nested in list items keep the list compact.
  return styled.replace(
    /<li([^>]*)>\s*<p([^>]*)>/gi,
    (_match, liAttributes = "", paragraphAttributes = "") =>
      `<li${liAttributes}><p${paragraphAttributes}>`.replace(
        /<p([^>]*)>/i,
        (paragraphTag) => mergeInlineStyles(paragraphTag, "margin:0;")
      )
  )
}

export function renderBroadcastBlockHtml(block: BroadcastBlock): string {
  switch (block.kind) {
    case "header": {
      const {
        logoUrl,
        logoWidth,
        logoHeight,
        alignment,
        backgroundColor,
        paddingTop,
        paddingBottom,
      } = block.content
      // `inline-block`, not `block`. A block-level image ignores the cell's
      // `text-align` entirely and has to be pushed around with auto margins —
      // which is how "right" used to do nothing at all, since it got the same
      // `margin:0 0` as "left". Inline-block hands all three alignments to the
      // one `text-align` below, which is also what Outlook actually honours.
      const inner = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" width="${logoWidth}" style="width:${logoWidth}px;height:${logoHeight ? `${logoHeight}px` : "auto"};display:inline-block;vertical-align:middle;border:0;outline:none;" />`
        : ""
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${escapeHtml(backgroundColor)};"><tr><td style="padding:${paddingTop}px 20px ${paddingBottom}px 20px;text-align:${alignment};">${inner}</td></tr></table>`
    }

    case "richText": {
      const { htmlContent, backgroundColor, padding } = block.content
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${escapeHtml(backgroundColor)};"><tr><td style="padding:${padding}px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#333333;">${styleRichTextHtml(htmlContent)}</td></tr></table>`
    }

    case "button": {
      const {
        label,
        url,
        backgroundColor,
        textColor,
        alignment,
        borderRadius,
        padding,
      } = block.content
      // A nested table, not a styled <a>. Outlook throws away padding and
      // background on a link, so the only shape that arrives looking like a
      // button everywhere is a one-cell table with the colour on the cell.
      // Checked here as well as on the way into the database, because the
      // editor draws every keystroke through this and an address is unusable
      // for most of the time it is being typed.
      const href = safeLinkUrl(url) || ACTION_URL_TOKEN
      const inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;border-collapse:separate;"><tr><td style="background-color:${escapeHtml(backgroundColor)};border-radius:${borderRadius}px;text-align:center;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 24px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;line-height:1.2;color:${escapeHtml(textColor)};text-decoration:none;border-radius:${borderRadius}px;">${escapeHtml(label)}</a></td></tr></table>`
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${padding}px;text-align:${alignment};">${inner}</td></tr></table>`
    }

    case "divider": {
      const { color, thickness, width, spacing } = block.content
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:${spacing}px 0;text-align:center;"><hr style="border:none;border-top:${thickness}px solid ${escapeHtml(color)};width:${width}%;margin:0 auto;" /></td></tr></table>`
    }

    case "footer": {
      const { companyName, companyAddress, alignment, showUnsubscribe } =
        block.content
      let inner = ""
      if (companyName) {
        inner += `<p style="margin:0 0 4px 0;font-weight:bold;">${escapeHtml(companyName)}</p>`
      }
      if (companyAddress) {
        inner += `<p style="margin:0 0 12px 0;" class="unstyle-auto-detected-links">${escapeHtml(companyAddress)}</p>`
      }
      if (showUnsubscribe) {
        inner += `<p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#999999;text-decoration:underline;">Unsubscribe</a></p>`
      }
      return `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:20px;text-align:${alignment};font-family:Arial,sans-serif;font-size:12px;color:#999999;">${inner}</td></tr></table>`
    }
  }
}

export function renderBroadcastEmailHtml(
  blocks: BroadcastBlock[],
  options: { preheader?: string } = {}
): string {
  const preheader = options.preheader?.trim()
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>`
    : ""
  const wrappedBlocks = blocks
    .map((block) => `<tr><td>${renderBroadcastBlockHtml(block)}</td></tr>`)
    .join("")

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta name="format-detection" content="address=no"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><style>@media only screen and (max-width:${EMAIL_MAX_WIDTH + 20}px){.email-container{width:100%!important;}}.unstyle-auto-detected-links a[x-apple-data-detectors],.unstyle-auto-detected-links a{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important;}</style></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;">${preheaderHtml}<center><!--[if mso]><table role="presentation" width="${EMAIL_MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]--><table role="presentation" class="email-container" width="${EMAIL_MAX_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">${wrappedBlocks}</table><!--[if mso]></td></tr></table><![endif]--></center></body></html>`
}

/**
 * Replaces personalization tokens with contact values. Contact fields arrive
 * via the public ingest API, so they are escaped before landing in HTML.
 * The unsubscribe URL is generated by us and must not be double-escaped.
 */
export function personalizeEmail(
  template: string,
  contact: { email: string; firstName: string | null; lastName: string | null },
  options: { html: boolean; unsubscribeUrl?: string }
) {
  const clean = (value: string) => (options.html ? escapeHtml(value) : value)
  let output = template
    .replaceAll("{{email}}", clean(contact.email))
    .replaceAll("{{firstName}}", clean(contact.firstName ?? ""))
    .replaceAll("{{lastName}}", clean(contact.lastName ?? ""))
  if (options.unsubscribeUrl !== undefined) {
    output = output.replaceAll(
      "{{unsubscribe_url}}",
      options.html ? escapeHtml(options.unsubscribeUrl) : options.unsubscribeUrl
    )
  }
  return output
}
