import { escapeHtml } from "@/lib/email/escape-html"
import { INVITE_LIFETIME_DAYS } from "@/lib/project/rules"
import { getWorkspaceSystemEmailSender } from "@/server/email/app-sender"
import { getEmailProvider } from "@/server/email/provider"
import { getAppEmailApiKey } from "@/server/email/settings"
import { db, type CustomShellDb } from "@/server/db"

export type InviteEmail = {
  to: string
  teamName: string
  inviterName: string
  link: string
  /** The shell site whose sender address the email goes out from. */
  workspaceId: string | null
}

/**
 * Sends one team invite. Answers whether an email really left: with no email
 * key saved in Settings → Email and none in the environment, nothing is sent,
 * and the inviter is told to copy the link instead of being told it went.
 *
 * The invite goes through the email provider directly rather than the shell's
 * list of system emails, because adding a kind to that list means editing
 * shell files, which an app never does.
 */
export async function sendInviteEmail(
  email: InviteEmail,
  database: CustomShellDb = db
): Promise<{ emailed: boolean; error?: string }> {
  const apiKey =
    (await getAppEmailApiKey(database, email.workspaceId ?? undefined)) ??
    process.env.CUSTOM_SHELL_RESEND_API_KEY ??
    ""
  if (!apiKey) return { emailed: false }

  const sender = await getWorkspaceSystemEmailSender(email.workspaceId, database)
  const result = await getEmailProvider(apiKey).send({
    from: sender.from,
    to: email.to,
    subject: `${email.inviterName} invited you to ${email.teamName}`,
    html: inviteHtml(email),
    text: inviteText(email),
  })
  return result.success
    ? { emailed: true }
    : { emailed: false, error: result.error ?? "The email was not accepted." }
}

function inviteText(email: InviteEmail) {
  return [
    `${email.inviterName} invited you to join ${email.teamName} on Project.`,
    "",
    `Join the team: ${email.link}`,
    "",
    `The link works for ${INVITE_LIFETIME_DAYS} days. If you weren't expecting this, you can ignore it.`,
  ].join("\n")
}

function inviteHtml(email: InviteEmail) {
  const team = escapeHtml(email.teamName)
  const inviter = escapeHtml(email.inviterName)
  const link = escapeHtml(email.link)
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111; line-height: 1.5;">
    <p>${inviter} invited you to join <strong>${team}</strong> on Project.</p>
    <p><a href="${link}" style="display: inline-block; padding: 8px 16px; background: #111; color: #fff; border-radius: 8px; text-decoration: none;">Join ${team}</a></p>
    <p style="color: #555; font-size: 14px;">The link works for ${INVITE_LIFETIME_DAYS} days. If you weren't expecting this, you can ignore it.</p>
  </body>
</html>`
}
