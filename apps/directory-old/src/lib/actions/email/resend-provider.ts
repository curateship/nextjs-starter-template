import { Resend } from 'resend'
import type { EmailProvider, SendEmailParams, SendEmailResult } from './provider'

export class ResendProvider implements EmailProvider {
  private resend: Resend

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey)
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    const result = await this.resend.emails.send({
      from: params.from,
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.replyTo && { replyTo: params.replyTo }),
      ...(params.headers && { headers: params.headers }),
    })

    if (result.error) {
      return {
        success: false,
        error: result.error.message || 'Failed to send email',
      }
    }

    if (!result.data?.id) {
      return {
        success: false,
        error: 'Failed to send email - no message ID returned',
      }
    }

    return {
      success: true,
      messageId: result.data.id,
    }
  }
}
