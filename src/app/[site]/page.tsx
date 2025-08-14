import { BlockRenderer } from "@/components/frontend/layout/pages/page-block-renderer"
import { getSiteBySubdomain } from "@/lib/actions/frontend-actions"
import { notFound } from "next/navigation"

interface SitePageProps {
  params: Promise<{ 
    site: string
  }>
}

export default async function SiteHomePage({ params }: SitePageProps) {
  const { site: siteSubdomain } = await params
  
  // Sanitize site subdomain to prevent injection attacks
  if (!siteSubdomain || siteSubdomain.includes('..') || siteSubdomain.includes('/')) {
    notFound()
  }
  
  // Get site data for the home page
  const { success, site } = await getSiteBySubdomain(siteSubdomain, 'home')
  
  if (!success || !site) {
    notFound()
  }
  
  return <BlockRenderer site={site} />
}

export async function generateMetadata({ params }: SitePageProps) {
  const { site: siteSubdomain } = await params
  
  // Sanitize site subdomain to prevent injection attacks
  if (!siteSubdomain || siteSubdomain.includes('..') || siteSubdomain.includes('/')) {
    return {
      title: 'Invalid Site',
      description: 'Invalid site request.',
    }
  }
  
  try {
    const { success, site } = await getSiteBySubdomain(siteSubdomain, 'home')
    
    if (!success || !site) {
      return {
        title: 'Site Not Found',
        description: 'The requested site could not be found.',
      }
    }
    
    // Get the home page title from blocks
    const pageTitle = site.blocks?.hero?.[0]?.title || 'Welcome'
    const pageDescription = site.blocks?.hero?.[0]?.subtitle || ''
    
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