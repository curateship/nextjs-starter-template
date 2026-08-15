import { escapeHtml } from "@/lib/email/escape-html"
import { emailFirstName } from "@/lib/email/recipient-name"
import {
  createBroadcastBlock,
  parseStoredBlocks,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import { renderBroadcastEmailHtml } from "@/lib/broadcasts/render"
import { resolveAppName } from "@/lib/branding"
import {
  SYSTEM_EMAIL_META,
  applySystemEmailTokens,
  createSystemEmailBlocks,
  type SystemEmailKind,
} from "@/lib/system-emails/kinds"
import { getAppEmailApiKey } from "@/server/email/settings"
import {
  captureDevEmail,
  devOutboxIsAvailable,
} from "@/server/email/dev-outbox"
import { visitorWorkspaceId } from "@/server/workspaces/for-request"
import {
  getSystemEmail,
  recordSystemEmailSend,
} from "@/server/email/system-emails"
import { emailBrandName, protectSentEmailLogos } from "@/server/email/branding"

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export type AuthEmail = {
  /** Which of the app's own emails this is — the one whose wording it uses. */
  kind: SystemEmailKind
  to: string
  /** The stored account name. It is never inferred from the email address. */
  recipientName: string | null
  actionUrl: string
  /** Stops this one action link and records that the email was unwanted. */
  reportUrl?: string
  /** The site is explicit for admin test sends; visitor flows resolve it by host. */
  workspaceId?: string
  /**
   * Values for the placeholders this kind of email offers, over and above the
   * address and the link, which are filled in for every one of them.
   */
  tokens?: Record<string, string>
}

// A sign-in link in a log file is a sign-in link. Treat either signal as
// production so a deployment that forgets CUSTOM_SHELL_API_ENV fails loudly
// instead of printing reset tokens and silently sending nothing.
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
export function composeSystemEmail(
  email: AuthEmail,
  saved: SavedSystemEmail,
  options: { appName?: string } = {}
) {
  const meta = SYSTEM_EMAIL_META[email.kind]
  const values: Record<string, string> = {
    ...email.tokens,
    email: email.to,
    firstName: emailFirstName(email.recipientName, email.to),
    action_url: email.actionUrl,
  }

  const blocks = saved
    ? withUnwantedRequestLink(parseStoredBlocks(saved.blocks), email.reportUrl)
    : []
  const subject = saved?.subject.trim() ? saved.subject : null

  if (subject && blocks.length > 0) {
    const html = renderBroadcastEmailHtml(blocks, {
      preheader: saved?.preheader
        ? applySystemEmailTokens(saved.preheader, values, { html: false })
        : applySystemEmailTokens(subject, values, {
            html: false,
          }),
      appName: options.appName,
      renderStyle: "system",
    })
    return {
      subject: applySystemEmailTokens(subject, values, { html: false }),
      html: applySystemEmailTokens(html, values, { html: true }),
      fromName: saved?.fromName ?? null,
    }
  }

  const builtInHtml = renderBroadcastEmailHtml(
    withUnwantedRequestLink(
      createSystemEmailBlocks(email.kind),
      email.reportUrl
    ),
    {
      preheader: applySystemEmailTokens(meta.defaults.message, values, {
        html: false,
      }),
      appName: resolveAppName(options.appName),
      renderStyle: "system",
    }
  )
  return {
    subject: applySystemEmailTokens(meta.defaults.subject, values, {
      html: false,
    }),
    html: applySystemEmailTokens(builtInHtml, values, { html: true }),
    fromName: null,
  }
}

/** Adds the fixed security action before the editable email's footer. */
function withUnwantedRequestLink(
  blocks: BroadcastBlock[],
  reportUrl: string | undefined
) {
  if (!reportUrl) return blocks

  const report = createBroadcastBlock("richText")
  if (report.kind !== "richText") return blocks
  report.content.htmlContent = `<p><a href="${escapeHtml(reportUrl)}">I didn&#39;t ask for this</a></p>`

  const footerIndex = blocks.findIndex((block) => block.kind === "footer")
  if (footerIndex < 0) return [...blocks, report]
  return [
    ...blocks.slice(0, footerIndex),
    report,
    ...blocks.slice(footerIndex),
  ]
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
  configured: string,
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
      "Custom Shell <onboarding@resend.dev>",
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
  const workspaceId =
    email.workspaceId ?? (await visitorWorkspaceId().catch(() => null))

  // A database that will not answer must not stop a password reset, so a
  // failure here falls through to the built-in wording rather than throwing.
  let saved = workspaceId
    ? await getSystemEmail(workspaceId, email.kind).catch(() => null)
    : null
  let appName: string | undefined
  if (workspaceId && saved) {
    try {
      appName = await emailBrandName(workspaceId)
      await protectSentEmailLogos(workspaceId, parseStoredBlocks(saved.blocks))
    } catch {
      // Authentication email must still go out. If the database cannot make
      // its custom logo permanent, the safe answer is the built-in email with
      // no image rather than a custom email whose logo may later break.
      saved = null
    }
  } else if (workspaceId) {
    // Built-in wording has no saved header to resolve this for it, but it still
    // needs to say which site sent it when every picture is unavailable.
    appName = await emailBrandName(workspaceId).catch(() => undefined)
  }
  const { subject, html, fromName } = composeSystemEmail(email, saved, {
    appName,
  })

  captureDevEmail({ workspaceId, toEmail: email.to, subject, html })

  // The key an admin saved under Settings → Email, and the environment
  // variable as the fallback. Reading only the variable is what used to make
  // this quietly do nothing on a server where somebody had filled the tab in.
  const apiKey =
    (await getAppEmailApiKey(undefined, workspaceId ?? undefined).catch(
      () => null,
    )) || process.env.CUSTOM_SHELL_RESEND_API_KEY

  if (!apiKey) {
    if (!devOutboxIsAvailable()) {
      await logSend(workspaceId, email, subject, {
        status: "failed",
        error: "No Resend key is saved under Settings → Email.",
      })
      throw new Error("EMAIL_NOT_CONFIGURED")
    }

    console.info(
      `[custom-shell] email not configured, ${subject} link for ${email.to}: ${email.actionUrl}`,
    )
    await logSend(workspaceId, email, subject, {
      status: "failed",
      error: "Email is not set up on this server, so it was only logged.",
    })
    return { delivered: false }
  }

  let response: Response
  try {
    response = await fetch(RESEND_ENDPOINT, {
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
  } catch {
    // Network errors have no provider response to quote. Keep the useful fact
    // without logging a low-level error that could contain request details.
    await logSend(workspaceId, email, subject, {
      status: "failed",
      error: "The email service could not be reached.",
    })
    throw new Error("EMAIL_DELIVERY_FAILED")
  }

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
  },
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
