import {
  describeResendFailure,
  unreachableEmailServiceFailure,
  type EmailDeliveryFailureKind,
} from "@/lib/email/delivery-failure"

const RESEND_ENDPOINT = "https://api.resend.com/emails"

/**
 * Where the body of a received email is fetched from.
 *
 * Resend's `email.received` webhook carries metadata only — sender, subject,
 * attachment names — because an attachment-heavy mail would not fit in a
 * webhook body on most hosts. The body, the headers and the files are asked
 * for afterwards, by the id the event gave.
 */
const RESEND_RECEIVING_ENDPOINT = "https://api.resend.com/emails/receiving"

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
  failureKind?: EmailDeliveryFailureKind
}

/**
 * The parts of a received email worth keeping.
 *
 * Headers come back as a bag of strings, and the two that matter are
 * `In-Reply-To` and `Message-ID`: between them they are what makes a reply
 * join the thread it answers instead of starting a new one.
 */
export type ReceivedEmail = {
  text: string | null
  html: string | null
  messageId: string | null
  inReplyTo: string | null
}

export type ReceiveEmailResult = {
  success: boolean
  email?: ReceivedEmail
  error?: string
  failureKind?: EmailDeliveryFailureKind
}

export type EmailProvider = {
  send(params: SendEmailParams): Promise<SendEmailResult>
  /** Fetches the body of one received email by the id the webhook gave. */
  receive(emailId: string): Promise<ReceiveEmailResult>
}

/**
 * Reads one header out of whatever shape the provider answered with.
 *
 * Resend has answered headers as an object and as a list of name/value pairs
 * at different times, so both are accepted. Header names are matched without
 * case, because `Message-ID`, `Message-Id` and `message-id` are the same
 * header and real mail servers use all three.
 */
export function readEmailHeader(
  headers: unknown,
  name: string
): string | null {
  const wanted = name.toLowerCase()

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (!entry || typeof entry !== "object") continue
      const row = entry as { name?: unknown; value?: unknown }
      if (
        typeof row.name === "string" &&
        row.name.toLowerCase() === wanted &&
        typeof row.value === "string"
      ) {
        return row.value
      }
    }
    return null
  }

  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(
      headers as Record<string, unknown>
    )) {
      if (key.toLowerCase() === wanted && typeof value === "string") {
        return value
      }
    }
  }

  return null
}

/**
 * Sends through Resend's HTTP API.
 *
 * Over `fetch`, the same way `server/email/send.ts` already sends the short auth
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
    } catch {
      const failure = unreachableEmailServiceFailure()
      return {
        success: false,
        error: failure.reason,
        failureKind: failure.kind,
      }
    }

    const body = (await response.json().catch(() => null)) as {
      id?: string
      name?: string
      type?: string
      message?: string
      error?: { name?: string; type?: string; message?: string }
    } | null

    if (!response.ok) {
      const failure = describeResendFailure(response.status, body)
      return {
        success: false,
        error: failure.reason,
        failureKind: failure.kind,
      }
    }

    if (!body?.id) {
      return {
        success: false,
        error: "Resend accepted it but gave no id back",
        failureKind: "retryable",
      }
    }

    return { success: true, messageId: body.id }
  }

  async receive(emailId: string): Promise<ReceiveEmailResult> {
    let response: Response
    try {
      response = await fetch(
        `${RESEND_RECEIVING_ENDPOINT}/${encodeURIComponent(emailId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${this.apiKey}` },
        }
      )
    } catch {
      const failure = unreachableEmailServiceFailure()
      return {
        success: false,
        error: failure.reason,
        failureKind: failure.kind,
      }
    }

    const body = (await response.json().catch(() => null)) as {
      text?: string | null
      html?: string | null
      headers?: unknown
      message_id?: string | null
    } | null

    if (!response.ok) {
      const failure = describeResendFailure(response.status, body)
      return {
        success: false,
        error: failure.reason,
        failureKind: failure.kind,
      }
    }

    if (!body) {
      return {
        success: false,
        error: "Resend answered with nothing",
        failureKind: "retryable",
      }
    }

    return {
      success: true,
      email: {
        text: typeof body.text === "string" ? body.text : null,
        html: typeof body.html === "string" ? body.html : null,
        // The top-level field when there is one, the header otherwise.
        messageId:
          typeof body.message_id === "string" && body.message_id
            ? body.message_id
            : readEmailHeader(body.headers, "message-id"),
        inReplyTo: readEmailHeader(body.headers, "in-reply-to"),
      },
    }
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

  /**
   * There is no mail to fetch without a key, and saying so plainly is better
   * than an empty body that reads as a real email with nothing in it.
   */
  async receive(emailId: string): Promise<ReceiveEmailResult> {
    console.info(
      `[custom-shell] no email key set, cannot fetch received email ${emailId}`
    )
    return {
      success: false,
      error: "No email key is set, so the message body cannot be fetched",
      failureKind: "needs_attention",
    }
  }
}

/**
 * What a test has to supply to stand in for the provider.
 *
 * `send` is required and `receive` is not, because almost every test here is
 * about sending and should not have to invent a fetch it never calls. A stub
 * without one gets the refusal below if anything does call it, which is loud
 * enough to find.
 */
export type EmailProviderStub = Pick<EmailProvider, "send"> &
  Partial<EmailProvider>

// Tests stub the provider so no real requests happen.
let providerFactoryOverride: ((apiKey: string) => EmailProviderStub) | null =
  null

export function setEmailProviderFactoryForTests(
  factory: ((apiKey: string) => EmailProviderStub) | null
) {
  providerFactoryOverride = factory
}

export function getEmailProvider(apiKey: string): EmailProvider {
  if (providerFactoryOverride) {
    const stub = providerFactoryOverride(apiKey)
    return {
      send: (params) => stub.send(params),
      receive: (emailId) =>
        stub.receive
          ? stub.receive(emailId)
          : Promise.resolve({
              success: false,
              error: `This test's email provider cannot fetch ${emailId}`,
              failureKind: "needs_attention" as const,
            }),
    }
  }
  return apiKey ? new ResendProvider(apiKey) : new LoggingProvider()
}
