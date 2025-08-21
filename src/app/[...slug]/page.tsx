import { BlockRenderer } from "@/components/frontend/layout/pages/page-block-renderer"
import { getSiteFromHeaders } from "@/lib/utils/site-headers"
import { notFound } from "next/navigation"

interface PageProps {
  params: Promise<{ 
    slug: string[]
  }>
}

export default async function DynamicPage({ params }: PageProps) {
  const { slug } = await params
  
  // Sanitize slug array to prevent path traversal attacks
  const sanitizedSlug = slug.filter(segment => 
    segment && 
    !segment.includes('..') && 
    !segment.includes('/') && 
    segment.trim() !== ''
  )
  const pagePath = sanitizedSlug.join('/')
  
  // Get site data with the specific page
  const { success, site } = await getSiteFromHeaders(pagePath)
  
  if (!success || !site) {
    notFound()
  }
  
  return <BlockRenderer site={site} />
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  
  // Sanitize slug array to prevent path traversal attacks
  const sanitizedSlug = slug.filter(segment => 
    segment && 
    !segment.includes('..') && 
    !segment.includes('/') && 
    segment.trim() !== ''
  )
  const pagePath = sanitizedSlug.join('/')
  
  try {
    const { success, site } = await getSiteFromHeaders(pagePath)
    
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