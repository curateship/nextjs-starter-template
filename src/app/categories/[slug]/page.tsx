import { CategoryBlockRenderer } from "@/components/frontend/categories/CategoryBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray } from '@/lib/utils/category-block-utils'
import { notFound } from "next/navigation"

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

interface CategoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  // Direct query to categories table
  const { data: category, error } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('site_id', site.id)
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!category || error) {
    notFound()
  }

  // Convert category blocks to array format
  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray(category.content_blocks || {}, category.id)
  } catch (error) {
    console.warn('Error loading category blocks:', error)
    blocks = []
  }

  const categoryWithBlocks = {
    ...category,
    blocks
  }

  return <CategoryBlockRenderer
    site={site}
    category={categoryWithBlocks}
  />
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const { slug } = await params

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Category Not Found',
        description: 'The requested category could not be found.',
      }
    }

    const { data: category, error } = await supabaseAdmin
      .from('categories')
      .select('*')
      .eq('site_id', site.id)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (!category || error) {
      return {
        title: 'Category Not Found',
        description: 'The requested category could not be found.',
      }
    }

    return {
      title: `${category.title} | ${site.name}`,
      description: category.meta_description || category.description || `${category.title} on ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Category Not Found',
      description: 'The requested category could not be found.',
    }
  }
}
