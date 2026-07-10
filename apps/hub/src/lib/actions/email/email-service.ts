import { getEmailProvider } from '@/lib/actions/email/provider'
import { signTrackedRedirect } from '@/lib/utils/link-tracking'
import { generateProductEmail } from './templates/product-delivery'

/**
 * Email service configuration
 */
interface EmailConfig {
  apiKey?: string
  fromEmail?: string
  fromName?: string
  replyTo?: string
  providerType?: string
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
  replyTo?: string
  rawHtml?: string
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
   * Get sender information
   */
  private getSenderInfo(config?: EmailConfig): {
    from: string
    replyTo?: string
  } {
    const fromEmail = config?.fromEmail
    const fromName = config?.fromName

    if (!fromEmail) {
      throw new Error('From email not configured')
    }

    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail

    return {
      from,
      replyTo: config?.replyTo,
    }
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
      const signature = signTrackedRedirect(token, href)
      const trackingUrl = `${baseUrl}/api/track/click/${token}?redirect=${encodedRedirect}&sig=${signature}`

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
        token,
        replyTo,
        rawHtml,
        config,
      } = params

      // Validate email
      if (!to || !this.isValidEmail(to)) {
        return {
          success: false,
          error: 'Invalid recipient email address',
        }
      }

      if (!config?.apiKey) {
        throw new Error('Email API key not configured. Add your API key in site Integration settings.')
      }

      const provider = getEmailProvider(config.apiKey, config.providerType)

      // Get sender info
      const { from, replyTo: configReplyTo } = this.getSenderInfo(config)

      // Transform content to add link tracking
      const htmlContent = rawHtml
        ? this.transformLinksToTracking(rawHtml, token)
        : generateProductEmail({
            productTitle,
            content: this.transformLinksToTracking(content, token),
            recipientEmail: to,
            trackingToken: token,
          })

      // Send email via provider
      return await provider.send({
        from,
        to,
        subject,
        html: htmlContent,
        replyTo: replyTo || configReplyTo,
      })
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
