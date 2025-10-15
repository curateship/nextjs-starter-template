import { TaxonomyBlockRenderer } from "@/components/frontend/taxonomies/TaxonomyBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray } from '@/lib/utils/taxonomy-block-utils'
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

interface TaxonomyPageProps {
  params: Promise<{
    typeSlug: string
    termSlug: string
  }>
}

export default async function TaxonomyPage({ params }: TaxonomyPageProps) {
  const { typeSlug, termSlug } = await params

  // Get site data from headers
  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  // Get taxonomy type by slug
  const { data: taxonomyType, error: typeError } = await supabaseAdmin
    .from('taxonomy_types')
    .select('id')
    .eq('site_id', site.id)
    .eq('slug', typeSlug)
    .single()

  if (!taxonomyType || typeError) {
    notFound()
  }

  // Direct query to taxonomies table
  const { data: taxonomy, error } = await supabaseAdmin
    .from('taxonomies')
    .select('*')
    .eq('site_id', site.id)
    .eq('taxonomy_type_id', taxonomyType.id)
    .eq('slug', termSlug)
    .eq('is_published', true)
    .single()

  if (!taxonomy || error) {
    notFound()
  }

  // Convert taxonomy blocks to array format
  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray(taxonomy.content_blocks || {}, taxonomy.id)
  } catch (error) {
    console.warn('Error loading taxonomy blocks:', error)
    blocks = []
  }

  const taxonomyWithBlocks = {
    ...taxonomy,
    blocks
  }

  return <TaxonomyBlockRenderer
    site={site}
    taxonomy={taxonomyWithBlocks}
  />
}

export async function generateMetadata({ params }: TaxonomyPageProps) {
  const { typeSlug, termSlug } = await params

  try {
    // Get site data from headers
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Taxonomy Not Found',
        description: 'The requested taxonomy could not be found.',
      }
    }

    // Get taxonomy type by slug
    const { data: taxonomyType, error: typeError } = await supabaseAdmin
      .from('taxonomy_types')
      .select('id, name')
      .eq('site_id', site.id)
      .eq('slug', typeSlug)
      .single()

    if (!taxonomyType || typeError) {
      return {
        title: 'Taxonomy Not Found',
        description: 'The requested taxonomy could not be found.',
      }
    }

    // Direct query to taxonomies table
    const { data: taxonomy, error } = await supabaseAdmin
      .from('taxonomies')
      .select('*')
      .eq('site_id', site.id)
      .eq('taxonomy_type_id', taxonomyType.id)
      .eq('slug', termSlug)
      .eq('is_published', true)
      .single()

    if (!taxonomy || error) {
      return {
        title: 'Taxonomy Not Found',
        description: 'The requested taxonomy could not be found.',
      }
    }

    return {
      title: `${taxonomy.title} | ${taxonomyType.name} | ${site.name}`,
      description: taxonomy.meta_description || taxonomy.description || `${taxonomy.title} in ${taxonomyType.name} on ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Taxonomy Not Found',
      description: 'The requested taxonomy could not be found.',
    }
  }
}
