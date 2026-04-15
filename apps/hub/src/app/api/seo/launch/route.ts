import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth/server'
import { db } from '@/lib/db'
import { seoLaunchCodes } from '@/lib/db/schema'
import { createSeoLaunchCode, createSeoLaunchExpiresAt, createSeoLaunchSnapshot, getSeoApiUrl } from '@/lib/actions/seo/sso'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    const loginUrl = new URL('/admin-login', request.url)
    loginUrl.searchParams.set('redirect', '/api/seo/launch')
    return NextResponse.redirect(loginUrl)
  }

  const launch = createSeoLaunchSnapshot({
    id: session.user.id,
    email: session.user.email,
    role: (session.user as { role?: string | null }).role,
  })

  if (!launch.seo_access) {
    return NextResponse.redirect(new URL('/admin/apps-integration?error=no-access', request.url))
  }

  const code = createSeoLaunchCode()

  await db.insert(seoLaunchCodes).values({
    code,
    hubUserId: launch.hub_user_id,
    email: launch.email,
    role: launch.role,
    seoAccess: launch.seo_access,
    expiresAt: createSeoLaunchExpiresAt(),
  })

  const seoApiUrl = getSeoApiUrl()
  const launchPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Launching whateverseo</title>
    <style>
      body {
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: #f5f7f2;
        color: #111827;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        width: min(560px, 100%);
        background: white;
        border: 1px solid rgba(17, 24, 39, 0.08);
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 24px 64px -40px rgba(17, 24, 39, 0.45);
      }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { margin: 0; line-height: 1.6; color: #4b5563; }
      .error {
        margin-top: 20px;
        border: 1px solid rgba(220, 38, 38, 0.25);
        background: rgba(220, 38, 38, 0.06);
        color: #b91c1c;
        border-radius: 16px;
        padding: 16px;
      }
      a { color: #166534; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <h1>Starting SEO Session</h1>
      <p>Redeeming your one-time Hub launch code and creating the SEO cookie session.</p>
      <div id="error"></div>
      <form id="launch-form" method="post" action="${seoApiUrl}/api/v1/auth/sso/exchange">
        <input type="hidden" name="code" value="${code}" />
        <noscript>
          <button type="submit">Continue to SEO</button>
        </noscript>
      </form>
    </main>
    <script>
      const form = document.getElementById('launch-form');
      const error = document.getElementById('error');

      if (form instanceof HTMLFormElement) {
        form.submit();
      } else if (error) {
        error.innerHTML = '<div class="error">Failed to start SEO session. <a href="/admin/apps-integration">Return to Hub</a></div>';
      }
    </script>
  </body>
</html>`

  return new NextResponse(launchPage, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
