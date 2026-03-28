import { getEmailProvider } from '@/lib/actions/email/provider'

interface LeadMagnetEmailParams {
  to: string
  subject: string
  fromName: string
  fromEmail?: string
  replyTo?: string
  content: string
  productName: string
  siteUrl: string
  apiKey?: string
  providerType?: string
}

/**
 * Send lead magnet delivery email
 * Simple email delivery with admin-configured content links
 */
export async function sendLeadMagnetDeliveryEmail(
  params: LeadMagnetEmailParams
): Promise<void> {
  const { to, subject, fromName, fromEmail, replyTo, content, productName, siteUrl, apiKey, providerType } = params

  if (!apiKey) {
    throw new Error('Email API key not configured. Add your API key in site Integration settings.')
  }
  const provider = getEmailProvider(apiKey, providerType)

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background: #4F46E5;
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          .header h1 {
            margin: 0;
            font-size: 24px;
          }
          .content {
            background: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 8px 8px;
          }
          .button {
            display: inline-block;
            background: #4F46E5;
            color: white !important;
            padding: 14px 32px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: 600;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            font-size: 14px;
            color: #666;
          }
          .user-content {
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Your ${productName} is Ready!</h1>
          </div>
          <div class="content">
            <div class="user-content">
              ${content}
            </div>
          </div>
        </div>
      </body>
    </html>
  `

  await provider.send({
    from: `${fromName} <${fromEmail || 'noreply@yourdomain.com'}>`,
    to,
    subject,
    html,
    ...(replyTo && { replyTo }),
  })
}
