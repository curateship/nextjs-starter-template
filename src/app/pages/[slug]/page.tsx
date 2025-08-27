import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { notFound } from "next/navigation"

// Create admin client for direct database queries
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

interface PagePageProps {
  params: Promise<{ 
    slug: string
  }>
}

export default async function PagePage({ params }: PagePageProps) {
  const { slug } = await params
  
  // Get site data from headers with page slug
  const { success: siteSuccess, site } = await getSiteFromHeaders(slug)
  
  if (!siteSuccess || !site) {
    notFound()
  }

  // The getSiteFromHeaders with slug should already load the page data
  // This uses the existing system for pages
  return <BlockRenderer site={site} />
}

export async function generateMetadata({ params }: PagePageProps) {
  const { slug } = await params
  
  try {
    // Get site data from headers
    const { success: siteSuccess, site } = await getSiteFromHeaders()
    
    if (!siteSuccess || !site) {
      return {
        title: 'Page Not Found',
        description: 'The requested page could not be found.',
      }
    }
    
    // Direct query to pages table
    const { data: page, error } = await supabaseAdmin
      .from('pages')
      .select('*')
      .eq('site_id', site.id)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (!page || error) {
      return {
        title: 'Page Not Found',
        description: 'The requested page could not be found.',
      }
    }
    
    return {
      title: `${page.title} | ${site.name}`,
      description: page.meta_description || `Visit ${page.title} on ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Page Not Found',
      description: 'The requested page could not be found.',
    }
  }
}