
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { toCdnUrl } from "@/lib/utils/cdn"

async function getHomePageSite() {
  return await getSiteFromHeaders('home')
}

async function checkAuth() {
  const cookieStore = await cookies()
  const authCookies = cookieStore.getAll().filter(cookie =>
    cookie.name.includes('sb-') && cookie.name.includes('-auth-token')
  )
  return authCookies.length > 0 && authCookies.some(c => c.value && c.value.length > 0)
}

export default async function SiteHomePage() {
  const { success, site } = await getHomePageSite()

  // No site found for this host — redirect to login
  if (!success || !site) {
    redirect('/login')
  }

  // Check maintenance mode - only redirect if not logged in
  if (site.settings?.maintenance?.enabled === true) {
    const isLoggedIn = await checkAuth()
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

    return {
      title: `${pageTitle} | ${site.name}`,
      description: pageDescription || `Welcome to ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Site Not Found',
      description: 'The requested site could not be found.',
    }
  }
}
