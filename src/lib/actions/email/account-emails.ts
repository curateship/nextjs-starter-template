import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface AccountEmailParams {
  to: string
  type: 'new_account' | 'existing_account'
  productName: string
  siteUrl: string
}

/**
 * Send account notification email
 * Different templates for new accounts vs existing accounts
 */
export async function sendAccountNotificationEmail(
  params: AccountEmailParams
): Promise<void> {
  const { to, type, productName, siteUrl } = params

  if (type === 'new_account') {
    // Email for newly created accounts
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
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 14px;
              color: #666;
            }
            ul {
              padding-left: 20px;
            }
            .highlight {
              background: #fef3c7;
              padding: 15px;
              border-radius: 6px;
              margin: 15px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome! Your Account is Ready</h1>
            </div>
            <div class="content">
              <p>Great news! We've created an account for you to access your lead magnet: <strong>${productName}</strong></p>

              <p><strong>What's next?</strong></p>
              <ul>
                <li>Check your inbox for a password setup link from Supabase</li>
                <li>Click the link to set your own password</li>
                <li>Log in to view all your lead magnets in one place</li>
              </ul>

              <div style="text-align: center;">
                <a href="${siteUrl}/login" class="button">Go to Login Page</a>
              </div>

              <div class="highlight">
                <p><strong>Why did we create an account?</strong></p>
                <p>So you can access your lead magnets anytime, even if you lose the email. Your content is always safe in your account!</p>
              </div>
            </div>
            <div class="footer">
              <p>Need help? Reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `

    await resend.emails.send({
      from: process.env.DEFAULT_FROM_EMAIL || 'noreply@yourdomain.com',
      to,
      subject: `🎉 Your Account is Ready - ${productName}`,
      html,
    })
  } else if (type === 'existing_account') {
    // Email for existing accounts
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
              background: #10B981;
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
              background: #10B981;
              color: white !important;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 14px;
              color: #666;
            }
            .highlight {
              background: #d1fae5;
              padding: 15px;
              border-radius: 6px;
              margin: 15px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📦 New Lead Magnet Added!</h1>
            </div>
            <div class="content">
              <p>Good news! <strong>${productName}</strong> has been added to your account.</p>

              <p>Log in to your account to access this and all your other lead magnets in one convenient place.</p>

              <div style="text-align: center;">
                <a href="${siteUrl}/login" class="button">Log In to Your Account</a>
              </div>

              <div class="highlight">
                <p><strong>Your lead magnets are always accessible</strong></p>
                <p>Even if you lose this email, you can always log in to access your content.</p>
              </div>
            </div>
            <div class="footer">
              <p>Need help? Reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `

    await resend.emails.send({
      from: process.env.DEFAULT_FROM_EMAIL || 'noreply@yourdomain.com',
      to,
      subject: `📦 New Lead Magnet Added - ${productName}`,
      html,
    })
  }
}
