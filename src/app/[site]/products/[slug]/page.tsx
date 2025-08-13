import { ProductBlockRenderer } from "@/components/frontend/layout/product-block-renderer"
import { getSiteBySubdomain } from "@/lib/actions/frontend-actions"
import { getProductBySlug } from "@/lib/actions/product-frontend-actions"
import { notFound } from "next/navigation"

interface SiteProductPageProps {
  params: Promise<{ 
    site: string
    slug: string
  }>
}

export default async function SiteProductPage({ params }: SiteProductPageProps) {
  const { site: siteSubdomain, slug } = await params
  
  // Get site data
  const { success: siteSuccess, site } = await getSiteBySubdomain(siteSubdomain, 'home')
  
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

export async function generateMetadata({ params }: SiteProductPageProps) {
  const { site: siteSubdomain, slug } = await params
  
  try {
    const { success: siteSuccess, site } = await getSiteBySubdomain(siteSubdomain, 'home')
    
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