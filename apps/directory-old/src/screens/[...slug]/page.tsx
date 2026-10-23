import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { notFound, redirect } from "@/lib/navigation-server"
import { headers } from "@/lib/request-headers"
import { getSessionCookie } from "better-auth/cookies"

async function checkAuth() {
  return !!getSessionCookie(await headers())
}

interface CatchAllPageProps {
  params: Promise<{
    slug: string[]
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function CatchAllPage({ params, searchParams }: CatchAllPageProps) {
  const { slug } = await params
  const fullSlug = slug.join('/')
  const isLoggedIn = await checkAuth()
  const pageValue = (await searchParams)?.page
  const parsedPage = parseInt(Array.isArray(pageValue) ? pageValue[0] || "1" : pageValue || "1", 10)

  const { success: siteSuccess, site } = await getSiteFromHeaders(fullSlug, {
    listingPage: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  })

  if (!siteSuccess || !site) {
    const fallback = await getSiteFromHeaders()
    if (fallback.site?.settings?.maintenance?.enabled === true && !isLoggedIn) {
      redirect('/maintenance')
    }

    notFound()
  }

  // Check maintenance mode - only redirect if not logged in
  if (site.settings?.maintenance?.enabled === true) {
    if (!isLoggedIn) {
      redirect('/maintenance')
    }
  }

  return <BlockRenderer site={site} />
}
