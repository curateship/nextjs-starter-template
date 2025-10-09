import { DirectoryBlockRenderer } from "@/components/frontend/directories/DirectoryBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray } from '@/lib/utils/directory-block-utils'
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

interface DirectoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function DirectoryPage({ params }: DirectoryPageProps) {
  const { slug } = await params

  // Get site data from headers
  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  // Direct query to directory table
  const { data: directory, error } = await supabaseAdmin
    .from('directory')
    .select('*')
    .eq('site_id', site.id)
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!directory || error) {
    notFound()
  }

  // Convert directory blocks to array format
  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray(directory.content_blocks || {}, directory.id)
  } catch (error) {
    console.warn('Error loading directory blocks:', error)
    blocks = []
  }

  const directoryWithBlocks = {
    ...directory,
    blocks
  }

  return <DirectoryBlockRenderer
    site={site}
    directory={directoryWithBlocks}
  />
}

export async function generateMetadata({ params }: DirectoryPageProps) {
  const { slug } = await params

  try {
    // Get site data from headers
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Directory Not Found',
        description: 'The requested directory could not be found.',
      }
    }

    // Direct query to directory table
    const { data: directory, error } = await supabaseAdmin
      .from('directory')
      .select('*')
      .eq('site_id', site.id)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (!directory || error) {
      return {
        title: 'Directory Not Found',
        description: 'The requested directory could not be found.',
      }
    }

    return {
      title: `${directory.title} | ${site.name}`,
      description: directory.meta_description || directory.description || `${directory.title} on ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Directory Not Found',
      description: 'The requested directory could not be found.',
    }
  }
}
