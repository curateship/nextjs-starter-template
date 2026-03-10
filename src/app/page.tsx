
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { LandingPage } from "@/components/frontend/pages/LandingPage"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { notFound, redirect } from "next/navigation"
import { cookies, headers } from "next/headers"

function isRootDomain(host: string): boolean {
  // localhost:3000 (no subdomain) → root domain
  // mysite.localhost:3000 → subdomain site
  // bare production domain (e.g. myapp.vercel.app) with no extra subdomain → root
  const clean = host.replace(/^www\./, '')
  // localhost without subdomain
  if (clean === 'localhost:3000' || clean === 'localhost') return true
  // Production: check NEXT_PUBLIC_APP_DOMAIN
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN?.replace(/^https?:\/\//, '')
  if (appDomain && clean === appDomain) return true
  return false
}

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
  // Check if this is the root domain — show landing page
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  if (isRootDomain(host)) {
    return <LandingPage />
  }

  // Subdomain site — resolve and render
  const { success, site } = await getHomePageSite()

  if (!success || !site) {
    notFound()
  }

  // Check maintenance mode - only redirect if not logged in
  if (site.settings?.maintenance?.enabled === true) {
    const isLoggedIn = await checkAuth()
    if (!isLoggedIn) {
      redirect('/maintenance')
    }
  }

  // Preload LCP image for performance optimization
  // Priority order: hero image > first listing image
  let lcpImageUrl = null

  // First, check for hero block image (most common LCP element)
  const heroBlock = site.blocks?.find(block => block.type === 'hero')
  if (heroBlock?.content?.image) {
    lcpImageUrl = heroBlock.content.image
  }

  // If no hero image, check for first listing-views product image
  if (!lcpImageUrl) {
    const listingBlock = site.blocks?.find(block => block.type === 'listing-views')
    if (listingBlock && site.listingData?.[listingBlock.id]) {
      const firstProduct = site.listingData[listingBlock.id]?.products?.[0]
      if (firstProduct?.featured_image) {
        lcpImageUrl = firstProduct.featured_image
      }
    }
  }

  return (
    <>
      {lcpImageUrl && (
        <link
          rel="preload"
          as="image"
          href={lcpImageUrl}
          fetchPriority="high"
        />
      )}
      <BlockRenderer site={site} />
    </>
  )
}

export async function generateMetadata() {
  try {
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    if (isRootDomain(host)) {
      return {
        title: 'System Everything',
        description: 'A platform for building and managing websites, stores, and content.',
      }
    }

    const { success, site } = await getHomePageSite()

    if (!success || !site) {
      return {
        title: 'Site Not Found',
        description: 'The requested site could not be found.',
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
