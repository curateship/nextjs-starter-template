import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { createClient } from '@supabase/supabase-js'
import { convertContentBlocksToArray } from '@/lib/utils/product-block-utils'
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

interface ProductPageProps {
  params: Promise<{ 
    slug: string
  }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params
  
  // Get site data from headers
  const { success: siteSuccess, site } = await getSiteFromHeaders()
  
  if (!siteSuccess || !site) {
    notFound()
  }
  
  // Direct query to products table - no bullshit
  const { data: product, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('site_id', site.id)
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!product || error) {
    notFound()
  }

  // Convert product blocks
  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray(product.content_blocks || {}, product.id)
  } catch (error) {
    console.warn('Error loading product blocks:', error)
    blocks = []
  }

  const productWithBlocks = {
    ...product,
    blocks
  }

  return <ProductBlockRenderer 
    site={site} 
    product={productWithBlocks} 
  />
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params
  
  try {
    // Get site data from headers
    const { success: siteSuccess, site } = await getSiteFromHeaders()
    
    if (!siteSuccess || !site) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.',
      }
    }
    
    // Direct query to products table
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('site_id', site.id)
      .eq('slug', slug)
      .eq('is_published', true)
      .single()

    if (!product || error) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.',
      }
    }
    
    return {
      title: `${product.title} | ${site.name}`,
      description: product.description || `${product.title} from ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.',
    }
  }
}