import { escapeHtml } from "@/lib/email/escape-html"
import { getEmailProvider } from "@/server/email/provider"
import {
  getAppEmailApiKey,
  getSendableEmailConfig,
} from "@/server/email/settings"
import { db, type CustomShellDb } from "@/server/db"

/**
 * The directory's own short emails: verify this address, your claim was
 * approved, somebody submitted a listing.
 *
 * **Why this exists rather than `server/email/send.ts`.** That module sends the
 * shell's *system* emails, and which ones exist is a fixed list in a shell file.
 * An app adding a kind to it would be editing the shell, which is the one thing
 * an app never does. So the app sends its own, through the same provider and the
 * same saved key.
 *
 * **Whose key sends it.** The site's own, then the deployment's. That is
 * `getSendableEmailConfig` for the from-address the site saved, and
 * `getAppEmailApiKey` for the key — which already prefers this site's row and
 * falls back to any other. **The fallback is the shell's own, written at its own
 * call site**, so this inherits it rather than restating it.
 */

const DEV_LOG_PREFIX = "[cms directory]"

function isProduction() {
  return process.env.NODE_ENV === "production"
}

export type DirectoryEmail = {
  workspaceId: string
  to: string
  subject: string
  /** The body as plain lines. Escaped here; callers never build markup. */
  lines: string[]
  action?: { label: string; url: string }
  /** A signed opt-out link for outreach mail. Adds the standard email headers too. */
  unsubscribeUrl?: string
}

/**
 * Wraps the lines in the plainest possible message.
 *
 * Deliberately not the shell's system-email template: that one is editable per
 * site and keyed by a kind this app cannot add. Text and one link, escaped, so
 * a business name somebody typed cannot be anything but text.
 */
function renderEmail(email: DirectoryEmail): string {
  const body = email.lines
    .map(
      (line) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#111">${escapeHtml(line)}</p>`
    )
    .join("")

  const action = email.action
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(email.action.url)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:15px">${escapeHtml(email.action.label)}</a></p>` +
      `<p style="margin:16px 0 0;font-size:13px;color:#666">If the button does not work, paste this into your browser:<br>${escapeHtml(email.action.url)}</p>`
    : ""

  const unsubscribe = email.unsubscribeUrl
    ? `<p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#666"><a href="${escapeHtml(email.unsubscribeUrl)}" style="color:#666">Stop claim invitations</a></p>`
    : ""

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px">${body}${action}${unsubscribe}</div>`
}

/**
 * Sends one, or says plainly that it could not.
 *
 * Outside production a missing key logs the message — including the link — so
 * the whole flow can be walked locally without an email account. Production
 * refuses instead: a verification link that was never sent has to be a failure
 * somebody sees, not a quiet nothing while the sender waits for an email.
 */
export async function sendDirectoryEmail(
  email: DirectoryEmail,
  database: CustomShellDb = db
): Promise<{ delivered: boolean }> {
  const configured = await getSendableEmailConfig(email.workspaceId, database)
  const apiKey =
    configured?.apiKey ||
    (await getAppEmailApiKey(database, email.workspaceId)) ||
    process.env.CUSTOM_SHELL_RESEND_API_KEY ||
    ""
  const from =
    configured?.from ||
    process.env.CUSTOM_SHELL_EMAIL_FROM ||
    "Custom Shell <onboarding@resend.dev>"

  if (!apiKey) {
    if (isProduction()) {
      throw new Error(
        "This site cannot send email yet. Add a Resend key under Settings → Email."
      )
    }
    console.info(
      `${DEV_LOG_PREFIX} email not configured. To ${email.to}: ${email.subject}` +
        (email.action ? ` — ${email.action.url}` : "")
    )
    return { delivered: false }
  }

  const result = await getEmailProvider(apiKey).send({
    from,
    to: email.to,
    subject: email.subject,
    html: renderEmail(email),
    ...(email.unsubscribeUrl
      ? {
          headers: {
            "List-Unsubscribe": `<${email.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  })

  if (!result.success) {
    // The provider's own words. A bare failure sends somebody hunting for a bug
    // in the app when the answer — an unverified domain, a test-mode key — was
    // in the response.
    throw new Error(
      result.error
        ? `The email could not be sent: ${result.error}`
        : "The email could not be sent."
    )
  }

  return { delivered: true }
}

/**
 * Tells the people who run the site that something is waiting.
 *
 * **This is not the shell's notification list, and that is on purpose.** Which
 * kinds of notice exist is a fixed list in a shell file, so an app cannot add
 * "a listing was submitted" without forking the shell. The queue screens carry
 * the count instead, and this puts one line in an admin's inbox so nobody has
 * to keep checking a screen.
 *
 * Never throws. A submission that was accepted must not fail because the people
 * who review it could not be told; the row is in the queue either way.
 */
export async function notifyAdmins(
  input: { workspaceId: string; subject: string; lines: string[]; url: string },
  admins: { email: string }[],
  database: CustomShellDb = db
): Promise<void> {
  for (const admin of admins) {
    try {
      await sendDirectoryEmail(
        {
          workspaceId: input.workspaceId,
          to: admin.email,
          subject: input.subject,
          lines: input.lines,
          action: { label: "Open the queue", url: input.url },
        },
        database
      )
    } catch {
      // Nothing to do about it here, and nothing worth failing the visitor's
      // submission over.
    }
  }
}
