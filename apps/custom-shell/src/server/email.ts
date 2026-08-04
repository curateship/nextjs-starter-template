import { escapeHtml } from "@/lib/escape-html"

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export type AuthEmail = {
  to: string
  subject: string
  heading: string
  message: string
  action: string
  actionUrl: string
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

/**
 * Sends a verification or password-reset email through Resend.
 *
 * With no API key, development logs the link so local sign-up still works end
 * to end; production refuses instead of silently dropping the message.
 */
export async function sendAuthEmail(email: AuthEmail) {
  const apiKey = process.env.CUSTOM_SHELL_RESEND_API_KEY
  if (!apiKey) {
    if (isProduction()) {
      throw new Error("EMAIL_NOT_CONFIGURED")
    }

    console.info(
      `[custom-shell] email not configured, ${email.subject} link for ${email.to}: ${email.actionUrl}`
    )
    return { delivered: false }
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.CUSTOM_SHELL_EMAIL_FROM ||
        "Custom Shell <onboarding@resend.dev>",
      to: [email.to],
      subject: email.subject,
      html: renderAuthEmail(email),
    }),
  })

  if (!response.ok) {
    throw new Error("EMAIL_DELIVERY_FAILED")
  }

  return { delivered: true }
}

function renderAuthEmail(email: AuthEmail) {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#18181b">
  <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(email.heading)}</h1>
  <p style="font-size:14px;line-height:1.6;margin:0 0 24px">${escapeHtml(email.message)}</p>
  <p style="margin:0 0 24px"><a href="${escapeHtml(email.actionUrl)}" style="display:inline-block;background:#18181b;color:#fafafa;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">${escapeHtml(email.action)}</a></p>
  <p style="font-size:12px;color:#71717a;margin:0">If you did not request this, you can ignore this email.</p>
</div>`
}
