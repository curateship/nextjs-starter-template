
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { LandingPage } from "@/components/frontend/pages/LandingPage"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

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

  // No site found for this host — show landing page
  if (!success || !site) {
    return <LandingPage />
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
