
import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-headers"
import { notFound } from "next/navigation"

export default async function SiteHomePage() {
  // Get site data from headers set by middleware
  const { success, site } = await getSiteFromHeaders('home')
  
  if (!success || !site) {
    notFound()
  }
  
  return <BlockRenderer site={site} />
}

export async function generateMetadata() {
  try {
    const { success, site } = await getSiteFromHeaders('home')
    
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
