
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { getSessionCookie } from "better-auth/cookies"
import { toCdnUrl } from "@/lib/utils/cdn"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"

async function getHomePageSite() {
  return await getSiteFromHeaders('home')
}

async function checkAuth() {
  return !!getSessionCookie(await headers())
}

export default async function SiteHomePage() {
  const { success, site } = await getHomePageSite()
  const isLoggedIn = await checkAuth()

  // No site found for this host — redirect to login
  if (!success || !site) {
    redirect('/admin-login')
  }

  // Check maintenance mode - only redirect if not logged in
  if (site.settings?.maintenance?.enabled === true) {
    if (!isLoggedIn) {
      redirect('/maintenance')
    }
  }

  // Find hero image for LCP preload
  const heroBlock = site.blocks?.find(block => block.type === 'hero')
  const heroStyle = heroBlock?.content?.heroStyle || 'default'
  const heroImage = heroBlock?.content?.styleConfig?.[heroStyle]?.heroImage || heroBlock?.content?.heroImage
  const lcpImageUrl = heroImage ? toCdnUrl(heroImage) : null

  return (
    <>
      {lcpImageUrl && (
        <link rel="preload" as="image" href={lcpImageUrl} fetchPriority="high" />
      )}
      <StructuredData site={site} contentType="home" />
      <BlockRenderer site={site} />
    </>
  )
}

export async function generateMetadata() {
  try {
    const { success, site } = await getHomePageSite()

    if (!success || !site) {
      return {
        title: 'System Everything',
        description: 'A platform for building and managing websites, stores, and content.',
      }
    }

    // Get the home page title from blocks
    const heroBlock = site.blocks?.find(block => block.type === 'hero')
    const pageTitle = heroBlock?.content?.title || 'Welcome'
    const pageDescription = heroBlock?.content?.subtitle || ''

    const title = `${pageTitle} | ${site.name}`
    const description = pageDescription || `Welcome to ${site.name}`

    return {
      title,
      description,
      ...buildSeoMetadata(site, { title: pageTitle, description }, 'home', '/'),
    }
  } catch (error) {
    return {
      title: 'Site Not Found',
      description: 'The requested site could not be found.',
    }
  }
}
