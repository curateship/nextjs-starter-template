import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface LeadMagnetEmailParams {
  to: string
  subject: string
  fromName: string
  replyTo?: string
  content: string
  clickTrackingUrl: string
  productName: string
  siteUrl: string
}

/**
 * Send lead magnet delivery email with click tracking
 * The email includes a tracked link that triggers Phase 2 account creation on first click
 */
export async function sendLeadMagnetDeliveryEmail(
  params: LeadMagnetEmailParams
): Promise<void> {
  const { to, subject, fromName, replyTo, content, clickTrackingUrl, productName, siteUrl } = params

  // Inject click tracking URL into content
  // Replace {{DOWNLOAD_LINK}} placeholder with actual tracked link
  const emailContent = content.replace(
    /\{\{DOWNLOAD_LINK\}\}/g,
    clickTrackingUrl
  )

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
              ${emailContent}
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${clickTrackingUrl}" class="button">
                Access Your Content
              </a>
            </div>

            <p style="font-size: 14px; color: #666; margin-top: 30px;">
              <strong>Note:</strong> We've created an account for you! Check your inbox for a password setup email from Supabase.
              Once you set your password, you can log in to access all your lead magnets in one place.
            </p>
          </div>
          <div class="footer">
            <p>Need help? Reply to this email.</p>
            <p><a href="${siteUrl}/dashboard">View Your Dashboard</a></p>
          </div>
        </div>
      </body>
    </html>
  `

  await resend.emails.send({
    from: `${fromName} <${process.env.DEFAULT_FROM_EMAIL || 'noreply@yourdomain.com'}>`,
    to,
    subject,
    html,
    ...(replyTo && { replyTo }),
  })
}
