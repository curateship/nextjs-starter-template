import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-headers"
import { getProductBySlug } from "@/lib/actions/product-frontend-actions"
import { notFound } from "next/navigation"

interface ProductPageProps {
  params: Promise<{ 
    slug: string
  }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params
  
  // Get site data from headers set by middleware
  const { success: siteSuccess, site } = await getSiteFromHeaders('home')
  
  if (!siteSuccess || !site) {
    notFound()
  }
  
  // Get product data for this specific site
  const productResult = await getProductBySlug(site.id, slug)
  
  if (!productResult.success || !productResult.product) {
    notFound()
  }
  
  return (
    <ProductBlockRenderer
      site={site}
      product={productResult.product}
    />
  )
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { slug } = await params
  
  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders('home')
    
    if (!siteSuccess || !site) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.',
      }
    }
    
    const productResult = await getProductBySlug(site.id, slug)
    
    if (!productResult.success || !productResult.product) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.',
      }
    }
    
    const product = productResult.product
    
    return {
      title: `${product.title} - ${site.name}`,
      description: product.meta_description || `${product.title} from ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Product Not Found',
      description: 'The requested product could not be found.',
    }
  }
}