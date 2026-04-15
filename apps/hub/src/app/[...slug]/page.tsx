import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { pages } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"
import { getPublicAuthPagePath, getAccountPageBySlug } from "@/lib/actions/account-pages/account-pages-frontend-actions"

async function checkAuth() {
  return !!getSessionCookie(await headers())
}

interface CatchAllPageProps {
  params: Promise<{
    slug: string[]
  }>
}

export default async function CatchAllPage({ params }: CatchAllPageProps) {
  const { slug } = await params
  const fullSlug = slug.join('/')
  const isLoggedIn = await checkAuth()

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  // Check maintenance mode - only redirect if not logged in
  if (site.settings?.maintenance?.enabled === true) {
    if (!isLoggedIn) {
      redirect('/maintenance')
    }
  }

  // Public pages always win if both builders claim the same slug.
  const [page] = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.siteId, site.id),
        eq(pages.slug, fullSlug),
        eq(pages.isPublished, true)
      )
    )
    .limit(1)

  if (page) {
    const pageResult = await getSiteFromHeaders(fullSlug)
    if (!pageResult.success || !pageResult.site) {
      notFound()
    }

    return <BlockRenderer site={pageResult.site} />
  }

  const userPageResult = await getAccountPageBySlug(site.id, fullSlug)

  if (userPageResult.error || !userPageResult.data) {
    if (userPageResult.error === 'Authentication required') {
      const { path: authPath } = await getPublicAuthPagePath(site.id)
      redirect(authPath || '/')
    }

    notFound()
  }

  return <BlockRenderer site={userPageResult.data} />
}
