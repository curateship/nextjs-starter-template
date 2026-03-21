import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { convertContentBlocksToArray } from '@/lib/utils/product-block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"

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

  // Direct query to products table
  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.siteId, site.id),
        eq(products.slug, slug),
        eq(products.isPublished, true)
      )
    )
    .limit(1)

  if (!product) {
    notFound()
  }

  // Convert product blocks
  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray((product.contentBlocks as any) || {}, product.id)
  } catch (error) {
    console.warn('Error loading product blocks:', error)
    blocks = []
  }

  const productWithBlocks = {
    ...toSnakeCase(product),
    blocks
  } as any

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
    const [product] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.siteId, site.id),
          eq(products.slug, slug),
          eq(products.isPublished, true)
        )
      )
      .limit(1)

    if (!product) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.',
      }
    }

    // Strip HTML tags from description for meta tags
    const cleanDescription = (product as any).description
      ? (product as any).description.replace(/<[^>]*>/g, '').trim()
      : `${product.title} from ${site.name}`

    return {
      title: `${product.title} | ${site.name}`,
      description: cleanDescription,
    }
  } catch (error) {
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.',
    }
  }
}
