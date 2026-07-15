type AuthEmail = { to: string; subject: string; heading: string; message: string; action: string; actionUrl: string }

export async function sendAuthEmail(email: AuthEmail) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") throw new Error("EMAIL_NOT_CONFIGURED")
    return
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.POMODER_EMAIL_FROM || "Pomoder <hello@example.com>",
      to: [email.to],
      subject: email.subject,
      html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;padding:32px"><h1>${escapeHtml(email.heading)}</h1><p>${escapeHtml(email.message)}</p><p><a href="${escapeHtml(email.actionUrl)}" style="display:inline-block;background:#ff5a3c;color:#0b0b0e;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">${escapeHtml(email.action)}</a></p><p style="color:#666">If you did not request this, you can ignore this email.</p></div>`,
    }),
  })
  if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED")
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character)
}
