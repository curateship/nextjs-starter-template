
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { notFound } from "next/navigation"

async function getHomePageSite() {
  return await getSiteFromHeaders('home')
}

export default async function SiteHomePage() {
  // Get site data from headers
  const { success, site } = await getHomePageSite()
  
  if (!success || !site) {
    notFound()
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
