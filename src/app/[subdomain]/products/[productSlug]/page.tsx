import { ProductBlockRenderer } from "@/components/frontend/layout/product-block-renderer"
import { getSiteBySubdomain } from "@/lib/actions/frontend-actions"
import { getProductBySlug } from "@/lib/actions/product-frontend-actions"
import { notFound } from "next/navigation"

interface ProductPageProps {
  params: Promise<{ 
    subdomain: string
    productSlug: string
  }>
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { subdomain, productSlug } = await params
  
  // Get site data
  const { success, site, error } = await getSiteBySubdomain(subdomain, 'home')
  
  if (!success || !site) {
    notFound()
  }

  // Get product data
  const productResult = await getProductBySlug(site.id, productSlug)
  
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
  const { subdomain, productSlug } = await params
  
  try {
    const { success, site } = await getSiteBySubdomain(subdomain, 'home')
    
    if (!success || !site) {
      return {
        title: 'Product Not Found',
        description: 'The requested product could not be found.',
      }
    }

    const productResult = await getProductBySlug(site.id, productSlug)
    
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