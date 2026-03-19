interface NewsletterBlock {
  id: string
  type: string
  title?: string
  content: Record<string, any>
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function generateEmailHtml(blocks: NewsletterBlock[], maxWidth: number = 600): string {
  const rendered = blocks.map(block => {
    switch (block.type) {
      case 'newsletter-header': {
        const { logoUrl, alignment = 'center', backgroundColor = '#ffffff', paddingTop, paddingBottom, padding = 20 } = block.content
        const pTop = paddingTop ?? padding
        const pBottom = paddingBottom ?? padding
        const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'
        let inner = ''
        if (logoUrl) {
          const logoW = block.content.logoWidth || 100
          const logoH = block.content.logoHeight
          inner += `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:${logoW}px;height:${logoH ? `${logoH}px` : 'auto'};display:block;margin:0 ${align === 'center' ? 'auto' : '0'};" />`
        }
        return `<div style="padding:${pTop}px 20px ${pBottom}px 20px;text-align:${align};background-color:${escapeHtml(backgroundColor)};">${inner}</div>`
      }
      case 'newsletter-rich-text': {
        const { htmlContent = '', backgroundColor = '#ffffff', padding = 20 } = block.content
        const styledContent = htmlContent
          .replace(/<p><br[^>]*><\/p>/gi, '<p style="margin:0 0 1.5em 0;">&nbsp;</p>')
          .replace(/<p style="/g, '<p style="margin:0 0 1.5em 0;')
          .replace(/<p>/g, '<p style="margin:0 0 1.5em 0;">')
        return `<div style="padding:${padding}px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#333333;background-color:${escapeHtml(backgroundColor)};">${styledContent}</div>`
      }
      case 'newsletter-divider': {
        const { color = '#e5e7eb', thickness = 1, width = 100, spacing = 20 } = block.content
        return `<div style="padding:${spacing}px 0;text-align:center;"><hr style="border:none;border-top:${thickness}px solid ${escapeHtml(color)};width:${width}%;margin:0 auto;" /></div>`
      }
      case 'newsletter-footer': {
        const { companyName = '', companyAddress = '', showUnsubscribe = true, alignment = 'center' } = block.content
        const align = alignment === 'left' ? 'left' : alignment === 'right' ? 'right' : 'center'
        let inner = ''
        if (companyName) inner += `<p style="margin:0 0 4px 0;font-weight:bold;">${escapeHtml(companyName)}</p>`
        if (companyAddress) inner += `<p style="margin:0 0 12px 0;">${escapeHtml(companyAddress)}</p>`
        if (showUnsubscribe) inner += `<p style="margin:0;"><a href="{{unsubscribe_url}}" style="color:#999999;text-decoration:underline;">Unsubscribe</a></p>`
        return `<div style="padding:20px;text-align:${align};font-family:Arial,sans-serif;font-size:12px;color:#999999;">${inner}</div>`
      }
      default:
        return ''
    }
  })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f5f5f5;">
<!--[if mso]><table role="presentation" width="${maxWidth}" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<div style="max-width:${maxWidth}px;margin:0 auto;background-color:#ffffff;">
${rendered.join('\n')}
</div>
<!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`
}
