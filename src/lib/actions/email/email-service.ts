import { Resend } from 'resend'
import { generateProductEmail } from './templates/product-delivery'

/**
 * Email service configuration
 */
interface EmailConfig {
  apiKey?: string
  fromEmail?: string
  fromName?: string
}

/**
 * Parameters for sending product delivery email
 */
interface SendProductEmailParams {
  to: string
  subject: string
  productTitle: string
  content: string // HTML content from admin
  productSlug: string
  token: string // Access token for link tracking
  config?: EmailConfig
}

/**
 * Email service result
 */
interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
}

/**
 * Email service for sending product delivery emails with link tracking
 */
class EmailService {
  /**
   * Get Resend client with site-specific or default API key
   */
  private getResendClient(apiKey?: string): Resend {
    const key = apiKey || process.env.RESEND_API_KEY
    if (!key) {
      throw new Error('Resend API key not configured')
    }
    return new Resend(key)
  }

  /**
   * Get sender information
   */
  private getSenderInfo(config?: EmailConfig): {
    from: string
    replyTo?: string
  } {
    const fromEmail = config?.fromEmail || process.env.DEFAULT_FROM_EMAIL
    const fromName = config?.fromName || process.env.DEFAULT_FROM_NAME

    if (!fromEmail) {
      throw new Error('From email not configured')
    }

    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail

    return { from }
  }

  /**
   * Transform HTML content to replace all links with tracking links
   */
  private transformLinksToTracking(html: string, token: string): string {
    // Get the base URL from environment
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_DOMAIN || 'http://localhost:3000'

    // Regular expression to match all <a> tags with href attributes
    const linkRegex = /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi

    return html.replace(linkRegex, (match, beforeHref, href, afterHref) => {
      // Skip if already a tracking link
      if (href.includes('/api/track/click/')) {
        return match
      }

      // Skip anchor links (same page)
      if (href.startsWith('#')) {
        return match
      }

      // Skip mailto: and tel: links
      if (href.startsWith('mailto:') || href.startsWith('tel:')) {
        return match
      }

      // Build tracking URL
      const encodedRedirect = encodeURIComponent(href)
      const trackingUrl = `${baseUrl}/api/track/click/${token}?redirect=${encodedRedirect}`

      // Reconstruct the anchor tag with tracking URL
      return `<a ${beforeHref}href="${trackingUrl}"${afterHref}>`
    })
  }

  /**
   * Send product delivery email with link tracking
   */
  async sendProductDeliveryEmail(
    params: SendProductEmailParams
  ): Promise<EmailResult> {
    try {
      const {
        to,
        subject,
        productTitle,
        content,
        productSlug,
        token,
        config,
      } = params

      // Validate email
      if (!to || !this.isValidEmail(to)) {
        return {
          success: false,
          error: 'Invalid recipient email address',
        }
      }

      // Get Resend client
      const resend = this.getResendClient(config?.apiKey)

      // Get sender info
      const { from, replyTo } = this.getSenderInfo(config)

      // Transform content to add link tracking
      const transformedContent = this.transformLinksToTracking(content, token)

      // Generate full email HTML with template
      const htmlContent = generateProductEmail({
        productTitle,
        content: transformedContent,
        recipientEmail: to,
        trackingToken: token,
      })

      // Send email via Resend
      const result = await resend.emails.send({
        from,
        to,
        subject,
        html: htmlContent,
        replyTo,
      })

      if (!result.id) {
        return {
          success: false,
          error: 'Failed to send email - no message ID returned',
        }
      }

      return {
        success: true,
        messageId: result.id,
      }
    } catch (error) {
      console.error('Error sending product delivery email:', error)
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Send test email (for integration testing)
   */
  async sendTestEmail(to: string, config?: EmailConfig): Promise<EmailResult> {
    return this.sendProductDeliveryEmail({
      to,
      subject: 'Test Email from Your App',
      productTitle: 'Test Product',
      content:
        '<h1>Test Email</h1><p>This is a test email. <a href="https://example.com">Click here</a> to test link tracking.</p>',
      productSlug: 'test-product',
      token: 'test-token-' + Date.now(),
      config,
    })
  }
}

// Export singleton instance
export const emailService = new EmailService()

// Export types
export type { SendProductEmailParams, EmailResult, EmailConfig }
