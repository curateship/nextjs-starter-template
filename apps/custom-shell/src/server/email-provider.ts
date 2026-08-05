const RESEND_ENDPOINT = "https://api.resend.com/emails"

export type SendEmailParams = {
  from: string
  to: string
  subject: string
  html: string
  replyTo?: string
  headers?: Record<string, string>
}

export type SendEmailResult = {
  success: boolean
  messageId?: string
  error?: string
}

export type EmailProvider = {
  send(params: SendEmailParams): Promise<SendEmailResult>
}

/**
 * Sends through Resend's HTTP API.
 *
 * Over `fetch`, the same way `server/email.ts` already sends the short auth
 * mails, rather than through the `resend` package — one less dependency, and
 * the two send paths behave the same when the API answers badly.
 */
class ResendProvider implements EmailProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async send(params: SendEmailParams): Promise<SendEmailResult> {
    let response: Response
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: params.from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          ...(params.replyTo ? { reply_to: params.replyTo } : {}),
          ...(params.headers ? { headers: params.headers } : {}),
        }),
      })
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Could not reach Resend",
      }
    }

    const body = (await response.json().catch(() => null)) as {
      id?: string
      message?: string
      error?: { message?: string }
    } | null

    if (!response.ok) {
      return {
        success: false,
        error:
          body?.error?.message || body?.message || `Resend said ${response.status}`,
      }
    }

    if (!body?.id) {
      return { success: false, error: "Resend accepted it but gave no id back" }
    }

    return { success: true, messageId: body.id }
  }
}

/**
 * What a workspace with no API key gets outside production: the message is
 * written to the server log instead of sent, so a send can be walked end to
 * end locally and the log shows exactly who it would have gone to.
 *
 * Production never reaches here — `getSendableEmailConfig` refuses to hand
 * back a config without a key, and the send pauses the broadcast instead.
 */
class LoggingProvider implements EmailProvider {
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    console.info(
      `[custom-shell] no email key set, would send "${params.subject}" to ${params.to}`
    )
    return { success: true, messageId: `dev-${crypto.randomUUID()}` }
  }
}

// Tests stub the provider so no real requests happen.
let providerFactoryOverride: ((apiKey: string) => EmailProvider) | null = null

export function setEmailProviderFactoryForTests(
  factory: ((apiKey: string) => EmailProvider) | null
) {
  providerFactoryOverride = factory
}

export function getEmailProvider(apiKey: string): EmailProvider {
  if (providerFactoryOverride) return providerFactoryOverride(apiKey)
  return apiKey ? new ResendProvider(apiKey) : new LoggingProvider()
}
