import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
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
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function getListingPage(searchParams?: Record<string, string | string[] | undefined>) {
  const value = searchParams?.page
  const page = parseInt(Array.isArray(value) ? value[0] || "1" : value || "1", 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export default async function CatchAllPage({ params, searchParams }: CatchAllPageProps) {
  const { slug } = await params
  const fullSlug = slug.join('/')
  const isLoggedIn = await checkAuth()

  const { success: siteSuccess, site } = await getSiteFromHeaders(fullSlug, {
    listingPage: getListingPage(await searchParams),
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
