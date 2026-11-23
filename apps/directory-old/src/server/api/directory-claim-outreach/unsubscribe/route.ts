import { NextRequest, NextResponse } from '@/lib/web-response'
import { verifyUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { recordClaimOutreachOptOut } from '@/lib/actions/directories/directory-claim-outreach-actions.server'

// (GET|POST) /api/directory-claim-outreach/unsubscribe?site=<id>&email=<email>&token=<hmac>
// One-click opt-out from claim-outreach emails. The token is an HMAC of
// (siteId, email), so no state is needed to validate it. On success the email
// is suppressed for the site and never invited again.
//
// GET is the link a person clicks; POST is the RFC 8058 one-click request mail
// clients (Gmail/Yahoo) send for the List-Unsubscribe-Post header. Both run the
// same token-gated opt-out, so the advertised one-click actually works.
function page(title: string, body: string, status: number) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #f5f5f5; color: #111; margin: 0; padding: 48px 16px; }
    .card { max-width: 460px; margin: 0 auto; background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 32px; text-align: center; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    p { font-size: 14px; line-height: 1.5; color: #555; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`

  return new NextResponse(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

async function handleUnsubscribe(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const siteId = params.get('site') || ''
  const email = (params.get('email') || '').trim().toLowerCase()
  const token = params.get('token') || ''

  if (!siteId || !email || !token || !verifyUnsubscribeToken(siteId, email, token)) {
    return page(
      'Link not valid',
      "This unsubscribe link is invalid or has expired. No changes were made.",
      400,
    )
  }

  try {
    await recordClaimOutreachOptOut(siteId, email)
  } catch (error) {
    console.error('Failed to record claim outreach opt-out:', error)
    return page(
      'Something went wrong',
      "We couldn't process your request. Please try again later.",
      500,
    )
  }

  return page(
    'You’re unsubscribed',
    "You won't receive any more emails about claiming this listing.",
    200,
  )
}

export async function GET(request: NextRequest) {
  return handleUnsubscribe(request)
}

export async function POST(request: NextRequest) {
  return handleUnsubscribe(request)
}
