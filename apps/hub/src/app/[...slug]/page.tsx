import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { pages } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"

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

  // Get site data from headers with page slug to load page data
  const { success: siteSuccess, site } = await getSiteFromHeaders(fullSlug)

  if (!siteSuccess || !site) {
    notFound()
  }

  // Check maintenance mode - only redirect if not logged in
  if (site.settings?.maintenance?.enabled === true) {
    if (!isLoggedIn) {
      redirect('/maintenance')
    }
  }

  // First check if this is a page
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
    // Page exists, render it at root level
    return <BlockRenderer site={site} initialHasSession={isLoggedIn} />
  }

}
