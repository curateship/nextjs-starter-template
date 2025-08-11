import { BlockRenderer } from "@/components/frontend/layout/block-renderer"
import { getSiteBySubdomain } from "@/lib/actions/frontend-actions"
import { notFound } from "next/navigation"

interface DynamicSubdomainPageProps {
  params: Promise<{ 
    subdomain: string
    slug: string[]
  }>
}

export default async function DynamicSubdomainPage({ params }: DynamicSubdomainPageProps) {
  const { subdomain, slug } = await params
  
  // Convert slug array to page slug
  const pageSlug = slug.join('/') || 'home'
  
  // Get site data
  const { success, site, error } = await getSiteBySubdomain(subdomain, pageSlug)
  
  if (!success || !site) {
    notFound()
  }

  return (
    <BlockRenderer
      site={site}
    />
  )
}

export async function generateMetadata({ params }: DynamicSubdomainPageProps) {
  const { subdomain, slug } = await params
  const pageSlug = slug.join('/') || 'home'
  
  try {
    const { success, site } = await getSiteBySubdomain(subdomain, pageSlug)
    
    if (!success || !site) {
      return {
        title: 'Page Not Found',
        description: 'The requested page could not be found.',
      }
    }
    
    return {
      title: `${pageSlug === 'home' ? site.name : `${pageSlug} - ${site.name}`}`,
      description: site.blocks?.hero?.subtitle || `${pageSlug} page for ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Page Not Found',
      description: 'The requested page could not be found.',
    }
  }
}