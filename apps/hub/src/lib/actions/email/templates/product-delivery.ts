/**
 * Props for product delivery email template
 */
interface ProductEmailProps {
  productTitle: string
  content: string // Rich HTML content from admin (already has tracking links)
  recipientEmail: string
  trackingToken: string
}

/**
 * Generate HTML email for product delivery
 * This template wraps the admin-provided content with proper email structure
 */
export function generateProductEmail(props: ProductEmailProps): string {
  const { productTitle, content } = props

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(productTitle)}</title>
  <style>
    /* Email-safe CSS */
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f4f4f4;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .email-header {
      background-color: #000000;
      color: #ffffff;
      padding: 20px;
      text-align: center;
    }
    .email-header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .email-body {
      padding: 40px 30px;
    }
    .email-body h1 {
      font-size: 24px;
      margin-top: 0;
      margin-bottom: 20px;
      color: #000000;
    }
    .email-body h2 {
      font-size: 20px;
      margin-top: 30px;
      margin-bottom: 15px;
      color: #000000;
    }
    .email-body h3 {
      font-size: 18px;
      margin-top: 25px;
      margin-bottom: 12px;
      color: #000000;
    }
    .email-body p {
      margin: 0 0 15px 0;
      color: #333333;
    }
    .email-body a {
      color: #0066cc;
      text-decoration: underline;
    }
    .email-body a:hover {
      color: #0052a3;
    }
    .email-body ul,
    .email-body ol {
      margin: 0 0 15px 0;
      padding-left: 30px;
    }
    .email-body li {
      margin-bottom: 8px;
    }
    .email-body img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 20px 0;
    }
    .email-body blockquote {
      margin: 20px 0;
      padding: 15px 20px;
      border-left: 4px solid #e0e0e0;
      background-color: #f9f9f9;
      color: #666666;
      font-style: italic;
    }
    .email-body pre {
      background-color: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 15px;
      overflow-x: auto;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      line-height: 1.4;
    }
    .email-body code {
      background-color: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
    }
    .email-footer {
      background-color: #f9f9f9;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
    }
    .email-footer p {
      margin: 5px 0;
      font-size: 14px;
      color: #666666;
    }
    .email-footer a {
      color: #666666;
      text-decoration: underline;
    }
    /* Button styling */
    .button {
      display: inline-block;
      padding: 12px 30px;
      margin: 20px 0;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none !important;
      border-radius: 5px;
      font-weight: 600;
    }
    .button:hover {
      background-color: #333333;
    }
    /* Mobile responsive */
    @media only screen and (max-width: 600px) {
      .email-body {
        padding: 30px 20px;
      }
      .email-header h1 {
        font-size: 20px;
      }
      .email-body h1 {
        font-size: 22px;
      }
      .email-body h2 {
        font-size: 18px;
      }
      .email-body h3 {
        font-size: 16px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="email-header">
      <h1>${escapeHtml(productTitle)}</h1>
    </div>

    <!-- Body Content (admin-provided HTML with tracking links) -->
    <div class="email-body">
      ${content}
    </div>

    <!-- Footer -->
    <div class="email-footer">
      <p>You received this email because you requested ${escapeHtml(productTitle)}.</p>
      <p style="margin-top: 15px; font-size: 12px;">
        If you have any questions, feel free to reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

/**
 * Escape HTML to prevent XSS in email subject/title
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char])
}
