import { BlockRenderer } from "@/components/frontend/layout/pages/page-block-renderer"
import { getSiteBySubdomain } from "@/lib/actions/frontend-actions"
import { notFound } from "next/navigation"

interface SitePageProps {
  params: Promise<{ 
    site: string
    slug: string[]
  }>
}

export default async function SitePage({ params }: SitePageProps) {
  const { site: siteSubdomain, slug } = await params
  
  // Sanitize site subdomain to prevent injection attacks
  if (!siteSubdomain || siteSubdomain.includes('..') || siteSubdomain.includes('/')) {
    notFound()
  }
  
  // Sanitize slug array to prevent path traversal attacks
  const sanitizedSlug = slug.filter(segment => 
    segment && 
    !segment.includes('..') && 
    !segment.includes('/') && 
    segment.trim() !== ''
  )
  const pagePath = sanitizedSlug.join('/')
  
  // Get site data with the specific page
  const { success, site } = await getSiteBySubdomain(siteSubdomain, pagePath)
  
  if (!success || !site) {
    notFound()
  }
  
  return <BlockRenderer site={site} />
}

export async function generateMetadata({ params }: SitePageProps) {
  const { site: siteSubdomain, slug } = await params
  
  // Sanitize site subdomain to prevent injection attacks
  if (!siteSubdomain || siteSubdomain.includes('..') || siteSubdomain.includes('/')) {
    return {
      title: 'Invalid Site',
      description: 'Invalid site request.',
    }
  }
  // Sanitize slug array to prevent path traversal attacks
  const sanitizedSlug = slug.filter(segment => 
    segment && 
    !segment.includes('..') && 
    !segment.includes('/') && 
    segment.trim() !== ''
  )
  const pagePath = sanitizedSlug.join('/')
  
  try {
    const { success, site } = await getSiteBySubdomain(siteSubdomain, pagePath)
    
    if (!success || !site) {
      return {
        title: 'Page Not Found',
        description: 'The requested page could not be found.',
      }
    }
    
    // Get the current page title from blocks
    const heroBlock = site.blocks?.find(block => block.type === 'hero')
    const pageTitle = heroBlock?.content?.title || 'Untitled Page'
    const pageDescription = heroBlock?.content?.subtitle || ''
    
    return {
      title: `${pageTitle} | ${site.name}`,
      description: pageDescription || `Welcome to ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Page Not Found',
      description: 'The requested page could not be found.',
    }
  }
}