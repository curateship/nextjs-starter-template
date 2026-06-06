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
}

export default async function CatchAllPage({ params }: CatchAllPageProps) {
  const { slug } = await params
  const fullSlug = slug.join('/')
  const isLoggedIn = await checkAuth()

  const { success: siteSuccess, site } = await getSiteFromHeaders(fullSlug)

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
