import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getAccountPageBySlug, getDefaultAccountPage } from "@/lib/actions/account-pages/account-pages-frontend-actions"
import { getPublicAuthPagePath } from "@/lib/actions/pages/page-frontend-actions"
import { auth } from "@/lib/actions/auth/server"
import { isPublicProfileTemplateSlug } from "@/lib/utils/account-page-path"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"

function withRedirectParam(path: string, targetPath: string) {
  if (path.startsWith('/account')) return '/'

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}redirect=${encodeURIComponent(targetPath)}`
}

async function redirectToAuth(siteId: string, targetPath: string): Promise<never> {
  const { path } = await getPublicAuthPagePath(siteId)
  redirect(path ? withRedirectParam(path, targetPath) : '/')
}

export async function renderAccountPage(slugSegments?: string[]) {
  const { success, site } = await getSiteFromHeaders()

  if (!success || !site) {
    notFound()
  }

  const slug = slugSegments?.join('/') || null

  if (isPublicProfileTemplateSlug(slug)) {
    notFound()
  }

  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  const accountPath = slug ? `/account/${slug}` : '/account'

  if (!session?.user) {
    await redirectToAuth(site.id, accountPath)
  }

  const result = slug
    ? await getAccountPageBySlug(site.id, slug)
    : await getDefaultAccountPage(site.id)

  if (result.error || !result.data) {
    if (result.error === 'Authentication required') {
      await redirectToAuth(site.id, accountPath)
    }

    notFound()
  }

  return <BlockRenderer site={result.data} accountContext />
}
