
import { headers } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { getSiteBySubdomain } from '@/lib/actions/frontend-actions'
import { SiteContent } from '@/components/frontend/site-content'
import { HeroRuixenBlock } from "@/components/frontend/layout/shared/HeroRuixenBlock";
import { PostGridBlock } from "@/components/frontend/layout/posts/PostGridBlock";
import { ProductGridBlock } from "@/components/frontend/layout/products/ProductGridBlock";

export default async function Home() {
  const headersList = await headers()
  const host = headersList.get('host') || ''
  
  // Extract subdomain from host
  const subdomain = host.split('.')[0]
  
  // If this is the main app domain (no subdomain), show the main app landing page
  if (!subdomain || subdomain === 'localhost' || subdomain === 'www') {
    return (
      <>
        <HeroRuixenBlock />
        <ProductGridBlock />
        <PostGridBlock />
      </>
    )
  }
  
  // This is a subdomain, try to load the site's homepage
  try {
    const { success, site, error } = await getSiteBySubdomain(subdomain, 'home')
    
    if (!success || !site) {
      console.error('Failed to load site:', error)
      notFound()
    }
    
    return <SiteContent site={site} />
  } catch (error) {
    console.error('Error loading site homepage:', error)
    notFound()
  }
}

export async function generateMetadata() {
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const subdomain = host.split('.')[0]
  
  // Main app domain
  if (!subdomain || subdomain === 'localhost' || subdomain === 'www') {
    return {
      title: 'Site Builder Platform',
      description: 'Create beautiful websites with our drag-and-drop site builder',
    }
  }
  
  // Try to get site metadata
  try {
    const { success, site } = await getSiteBySubdomain(subdomain, 'home')
    
    if (!success || !site) {
      return {
        title: 'Site Not Found',
        description: 'The requested site could not be found.',
      }
    }
    
    return {
      title: site.name,
      description: site.blocks.hero?.subtitle || `Welcome to ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Site Not Found',
      description: 'The requested site could not be found.',
    }
  }
}
