import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { AuthBlock } from "@/components/frontend/pages/auth/AuthBlockClient"
import { auth, isGoogleAuthEnabled } from "@/lib/actions/auth/server"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { isHubPlatformHost } from "@/lib/utils/platform-host"
import { getSessionCookie } from "better-auth/cookies"
import { headers } from "@/lib/request-headers"
import { notFound, redirect } from "@/lib/navigation-server"

async function isHubLoginRequest() {
  const requestHeaders = await headers()
  return isHubPlatformHost(requestHeaders.get("host"))
}

async function hasSession() {
  const session = await auth.api.getSession({ headers: await headers() })
  return !!session?.user
}

async function checkAuth() {
  return !!getSessionCookie(await headers())
}

function PlatformLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <AuthBlock
          defaultTab="login"
          visibility={{ showLoginTab: true, showRegisterTab: false }}
          googleEnabled={isGoogleAuthEnabled()}
          loginRedirectPath="/admin"
          registerRedirectPath="/admin"
          loginTitle="Hub sign in"
          loginDescription="Sign in to continue to the Hub admin"
          resetTitle="Reset Hub password"
          resetDescription="Enter your email to receive a reset link"
        />
      </div>
    </div>
  )
}

async function TenantLoginPage() {
  const isLoggedIn = await checkAuth()
  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  if (site.settings?.maintenance?.enabled === true && !isLoggedIn) {
    redirect('/maintenance')
  }

  const pageResult = await getSiteFromHeaders("login")
  if (!pageResult.success || !pageResult.site) {
    notFound()
  }

  return <BlockRenderer site={pageResult.site} googleEnabled={isGoogleAuthEnabled()} />
}

export default async function LoginPage() {
  if (await isHubLoginRequest()) {
    if (await hasSession()) {
      redirect('/admin')
    }

    return <PlatformLogin />
  }

  return TenantLoginPage()
}

export async function generateMetadata() {
  if (await isHubLoginRequest()) {
    return {
      title: 'System Everything Hub Login',
      description: 'Sign in to the System Everything Hub admin.',
    }
  }

  return {}
}
