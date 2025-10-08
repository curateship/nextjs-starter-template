
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { notFound, redirect } from "next/navigation"
import { cookies } from "next/headers"

async function getHomePageSite() {
  return await getSiteFromHeaders('home')
}

async function checkAuth() {
  // Check for Supabase auth cookie without hitting the database
  // This is much faster than calling getUser()
  const cookieStore = await cookies()
  const authCookies = cookieStore.getAll().filter(cookie =>
    cookie.name.includes('sb-') && cookie.name.includes('-auth-token')
  )
  return authCookies.length > 0 && authCookies.some(c => c.value && c.value.length > 0)
}

export default async function SiteHomePage() {
  // Get site data from headers
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

  return <BlockRenderer site={site} />
}

export async function generateMetadata() {
  try {
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
