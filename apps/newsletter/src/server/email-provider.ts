import { Resend } from "resend"

export interface SendEmailParams {
  from: string
  to: string
  subject: string
  html: string
  replyTo?: string
  headers?: Record<string, string>
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface EmailProvider {
  send(params: SendEmailParams): Promise<SendEmailResult>
}

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
        error: result.error.message || "Failed to send email",
      }
    }

    if (!result.data?.id) {
      return {
        success: false,
        error: "Failed to send email - no message ID returned",
      }
    }

    return {
      success: true,
      messageId: result.data.id,
    }
  }
}

// Tests stub the provider so no real Resend requests happen.
let providerFactoryOverride: ((apiKey: string) => EmailProvider) | null = null

export function setEmailProviderFactoryForTests(
  fn: ((apiKey: string) => EmailProvider) | null
) {
  providerFactoryOverride = fn
}

export function getEmailProvider(apiKey: string): EmailProvider {
  if (providerFactoryOverride) return providerFactoryOverride(apiKey)
  return new ResendProvider(apiKey)
}
