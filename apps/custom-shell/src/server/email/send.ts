import { escapeHtml } from "@/lib/email/escape-html"
import { emailFirstName } from "@/lib/email/recipient-name"
import { parseStoredBlocks } from "@/lib/broadcasts/blocks"
import { renderBroadcastEmailHtml } from "@/lib/broadcasts/render"
import {
  SYSTEM_EMAIL_META,
  applySystemEmailTokens,
  type SystemEmailKind,
} from "@/lib/system-emails/kinds"
import { getAppEmailApiKey } from "@/server/email/settings"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"
import {
  getSystemEmail,
  recordSystemEmailSend,
} from "@/server/email/system-emails"

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export type AuthEmail = {
  /** Which of the app's own emails this is — the one whose wording it uses. */
  kind: SystemEmailKind
  to: string
  /** The stored account name. It is never inferred from the email address. */
  recipientName: string | null
  actionUrl: string
  /**
   * Values for the placeholders this kind of email offers, over and above the
   * address and the link, which are filled in for every one of them.
   */
  tokens?: Record<string, string>
}

// A sign-in link in a log file is a sign-in link. Treat either signal as
// production so a deployment that forgets CUSTOM_SHELL_API_ENV fails loudly
// instead of printing reset tokens and silently sending nothing.
function isProduction() {
  return (
    process.env.CUSTOM_SHELL_API_ENV === "production" ||
    process.env.NODE_ENV === "production"
  )
}

/** Only the parts of a saved row this file cares about. */
export type SavedSystemEmail = {
  subject: string
  preheader: string
  fromName: string | null
  blocks: unknown
} | null

/**
 * The subject and the HTML for one of the app's own emails.
 *
 * The saved wording wins where there is any, and the built-in version is what
 * is left when there is not — no row yet, a subject blanked out, or blocks that
 * would render to an empty page. A person can edit these into something odd,
 * but they cannot edit them into nothing: a password reset with no words in it
 * is worse than one whose wording is out of date.
 *
 * Handed the saved row rather than fetching it, so the rules above can be
 * checked without a database.
 */
export function composeSystemEmail(email: AuthEmail, saved: SavedSystemEmail) {
  const meta = SYSTEM_EMAIL_META[email.kind]
  const values: Record<string, string> = {
    ...email.tokens,
    email: email.to,
    firstName: emailFirstName(email.recipientName, email.to),
    action_url: email.actionUrl,
  }

  const blocks = saved ? parseStoredBlocks(saved.blocks) : []
  const subject = saved?.subject.trim() ? saved.subject : null

  if (subject && blocks.length > 0) {
    const html = renderBroadcastEmailHtml(blocks, {
      preheader: saved?.preheader
        ? applySystemEmailTokens(saved.preheader, values, { html: false })
        : applySystemEmailTokens(subject, values, {
            html: false,
          }),
    })
    return {
      subject: applySystemEmailTokens(subject, values, { html: false }),
      html: applySystemEmailTokens(html, values, { html: true }),
      fromName: saved?.fromName ?? null,
    }
  }

  return {
    subject: applySystemEmailTokens(meta.defaults.subject, values, {
      html: false,
    }),
    html: renderBuiltInEmail({
      preheader: applySystemEmailTokens(meta.defaults.message, values, {
        html: false,
      }),
      firstName: values.firstName,
      heading: applySystemEmailTokens(meta.defaults.heading, values, {
        html: false,
      }),
      message: applySystemEmailTokens(meta.defaults.message, values, {
        html: false,
      }),
      action: meta.defaults.action,
      actionUrl: email.actionUrl,
      closing: applySystemEmailTokens(meta.defaults.closing, values, {
        html: false,
      }),
    }),
    fromName: null,
  }
}

/**
 * The From line, with a saved name in front of this server's own address.
 *
 * Only the name is anybody's to change. The address is whatever this server is
 * allowed to send as, and swapping it would simply bounce.
 *
 * Takes the configured sender rather than reading it, so the rule below can be
 * checked without setting environment variables.
 */
export function composeFromAddress(
  fromName: string | null,
  configured: string
) {
  // A From line is one line. Anything that could end it or start a second
  // header — a line break, angle brackets, quotes, a comma splitting it into
  // two senders — comes out before the name goes anywhere near it, so a name
  // typed into an admin box cannot add a Bcc.
  const safeName = (fromName ?? "")
    .replace(/[\r\n<>"',;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!safeName) return configured

  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured
  return `${safeName} <${address}>`
}

function fromAddress(fromName: string | null) {
  return composeFromAddress(
    fromName,
    process.env.CUSTOM_SHELL_EMAIL_FROM ||
      "Custom Shell <onboarding@resend.dev>"
  )
}

/**
 * Sends one of the app's own emails through Resend.
 *
 * With no API key, development logs the link so local sign-up still works end
 * to end; production refuses instead of silently dropping the message. Either
 * way the attempt is written down, so "the link never arrived" has an answer.
 */
export async function sendAuthEmail(email: AuthEmail) {
  // Which site is sending. Resolved from the domain the request arrived on —
  // somebody registering on Alpha gets Alpha's words from Alpha's sender, and
  // that is a question about the site, not about them. A deployment with no
  // site at all falls through to the built-in wording, as it always did.
  const workspaceId = await visitorWorkspaceId().catch(() => null)

  // A database that will not answer must not stop a password reset, so a
  // failure here falls through to the built-in wording rather than throwing.
  const saved = workspaceId
    ? await getSystemEmail(workspaceId, email.kind).catch(() => null)
    : null
  const { subject, html, fromName } = composeSystemEmail(email, saved)

  // The key an admin saved under Settings → Email, and the environment
  // variable as the fallback. Reading only the variable is what used to make
  // this quietly do nothing on a server where somebody had filled the tab in.
  const apiKey =
    (await getAppEmailApiKey(undefined, workspaceId ?? undefined).catch(
      () => null
    )) || process.env.CUSTOM_SHELL_RESEND_API_KEY

  if (!apiKey) {
    if (isProduction()) {
      await logSend(workspaceId, email, subject, {
        status: "failed",
        error: "No Resend key is saved under Settings → Email.",
      })
      throw new Error("EMAIL_NOT_CONFIGURED")
    }

    console.info(
      `[custom-shell] email not configured, ${subject} link for ${email.to}: ${email.actionUrl}`
    )
    await logSend(workspaceId, email, subject, {
      status: "failed",
      error: "Email is not set up on this server, so it was only logged.",
    })
    return { delivered: false }
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(fromName),
      to: [email.to],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    // Resend's own words, not just the number. Its refusals are the useful
    // kind — "the domain is not verified", "you can only send to your own
    // address" — and a bare 403 sends somebody hunting for a bug in the app
    // when the answer was sitting in the response all along.
    const reason = await response
      .json()
      .then((body: { message?: string }) => body?.message ?? "")
      .catch(() => "")

    await logSend(workspaceId, email, subject, {
      status: "failed",
      error: reason
        ? `The email service refused it (${response.status}): ${reason}`
        : `The email service refused it (${response.status}).`,
    })
    throw new Error("EMAIL_DELIVERY_FAILED")
  }

  const body = (await response.json().catch(() => null)) as {
    id?: string
  } | null
  await logSend(workspaceId, email, subject, {
    status: "sent",
    providerMessageId: body?.id ?? null,
  })

  return { delivered: true }
}

/**
 * Writes down what happened, and never gets in the way.
 *
 * A record of a password reset is worth having; it is not worth failing the
 * password reset over. A database that is briefly unhappy must not stop
 * somebody getting back into their account.
 */
async function logSend(
  workspaceId: string | null,
  email: AuthEmail,
  subject: string,
  outcome: {
    status: "sent" | "failed"
    providerMessageId?: string | null
    error?: string | null
  }
) {
  try {
    await recordSystemEmailSend({
      workspaceId,
      kind: email.kind,
      toEmail: email.to,
      subject,
      ...outcome,
    })
  } catch {
    // Nothing to do about it here, and nothing worth stopping for.
  }
}

/**
 * The email as it was before any of this was editable.
 *
 * Still the last word: this is what goes out when nobody has touched the
 * wording, and what goes out again if somebody empties it.
 */
function renderBuiltInEmail(email: {
  preheader: string
  firstName: string
  heading: string
  message: string
  action: string
  actionUrl: string
  closing: string
}) {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(email.preheader)}</div><div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b">
  <p style="font-size:14px;line-height:1.6;margin:0 0 24px">Hi ${escapeHtml(email.firstName)},</p>
  <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(email.heading)}</h1>
  <p style="font-size:14px;line-height:1.6;margin:0 0 24px">${escapeHtml(email.message)}</p>
  <p style="margin:0 0 24px"><a href="${escapeHtml(email.actionUrl)}" style="display:inline-block;background:#18181b;color:#fafafa;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">${escapeHtml(email.action)}</a></p>
  <p style="font-size:12px;color:#71717a;margin:0">${escapeHtml(email.closing)}</p>
</div>`
}
