import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { JsonLd } from "@/components/admin/shared/JsonLd"

interface ProductPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

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

  return (
    <>
      <JsonLd site={site} content={productWithBlocks} contentType="product" />
      <ProductBlockRenderer
        site={site}
        product={productWithBlocks}
      />
    </>
  )
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.',
      }
    }

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

    const cleanDescription = (product as any).description
      ? (product as any).description.replace(/<[^>]*>/g, '').trim()
      : `${product.title} from ${site.name}`

    return {
      title: `${product.title} | ${site.name}`,
      description: cleanDescription,
      ...buildSeoMetadata(site, product as any, 'product', `/products/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.',
    }
  }
}
