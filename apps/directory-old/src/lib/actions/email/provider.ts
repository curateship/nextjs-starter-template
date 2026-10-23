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

export function getEmailProvider(apiKey: string, providerType: string = 'resend'): EmailProvider {
  switch (providerType) {
    case 'resend': {
      return new ResendProvider(apiKey)
    }
    default:
      throw new Error(`Unknown email provider: ${providerType}`)
  }
}
import { ResendProvider } from './resend-provider'
