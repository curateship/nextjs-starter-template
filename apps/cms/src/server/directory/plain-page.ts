import { escapeHtml } from "@/lib/email/escape-html"

/**
 * The little page a link from an email lands on.
 *
 * Every one of these is opened from inside a mail client, often by somebody
 * who has never had an account here, so it has to render with no JavaScript,
 * no session and no app shell. That rules out the router, which is why this is
 * a string rather than a component. Everything in it is escaped: the only
 * things that vary are a title, a sentence and one link.
 */
export function plainLinkPage(
  title: string,
  message: string,
  status: number,
  link?: { label: string; href: string }
): Response {
  const action = link
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link.href)}" style="color:#111827;font-size:14px">${escapeHtml(link.label)}</a></p>`
    : ""
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:48px 20px;font-family:system-ui,-apple-system,sans-serif;background-color:#f4f4f5;"><div style="max-width:420px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center;"><h1 style="margin:0 0 8px 0;font-size:20px;color:#111827;">${escapeHtml(title)}</h1><p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(message)}</p>${action}</div></body></html>`
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
