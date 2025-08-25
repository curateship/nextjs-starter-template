import { BlockRenderer } from "@/components/frontend/pages/PageBlockRenderer"
import { ProductBlockRenderer } from "@/components/frontend/products/ProductBlockRenderer"
import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { resolveUrlPath } from "@/lib/utils/url-path-resolver"
import type { PostContent, ProductContent } from "@/lib/utils/url-path-resolver"
import type { SiteWithBlocks } from "@/lib/actions/pages/page-frontend-actions"
import type { ProductWithBlocks } from "@/lib/actions/products/product-frontend-actions"
import { notFound } from "next/navigation"

interface PageProps {
  params: Promise<{ 
    slug: string[]
  }>
}

export default async function DynamicPage({ params }: PageProps) {
  const { slug } = await params
  
  // Sanitize slug array to prevent path traversal attacks
  const sanitizedSlug = slug.filter(segment => 
    segment && 
    !segment.includes('..') && 
    !segment.includes('/') && 
    segment.trim() !== ''
  )
  const urlPath = sanitizedSlug.join('/')
  
  // Get site data from headers
  const { success: siteSuccess, site } = await getSiteFromHeaders()
  
  if (!siteSuccess || !site) {
    notFound()
  }
  
  // Use universal path resolver to find content
  // urlPath is already the full path from the sanitized slug array
  const resolution = await resolveUrlPath(site.id, urlPath)
  
  if (!resolution.success || !resolution.resolution) {
    notFound()
  }
  
  const { type, content } = resolution.resolution
  
  // Render based on content type
  switch (type) {
    case 'page':
      // For pages, we need to get site with blocks using the existing system
      const { success: pageSuccess, site: siteWithBlocks } = await getSiteFromHeaders(urlPath)
      if (!pageSuccess || !siteWithBlocks) {
        notFound()
      }
      return <BlockRenderer site={siteWithBlocks} />
      
    case 'product':
      return <ProductBlockRenderer 
        site={site} 
        product={content as ProductWithBlocks} 
      />
      
    case 'post':
      // For posts, we need to structure the data correctly
      const postContent = content as PostContent
      const postBlocks = postContent.content ? {
        'post-content': {
          id: 'post-content',
          type: 'post-content' as const,
          content: { body: postContent.content },
          display_order: 0
        }
      } : {}
      
      return (
        <div className="min-h-screen">
          <PostBlockRenderer blocks={postBlocks} />
        </div>
      )
      
    default:
      notFound()
  }
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  
  // Sanitize slug array to prevent path traversal attacks
  const sanitizedSlug = slug.filter(segment => 
    segment && 
    !segment.includes('..') && 
    !segment.includes('/') && 
    segment.trim() !== ''
  )
  const urlPath = sanitizedSlug.join('/')
  
  try {
    // Get site data from headers
    const { success: siteSuccess, site } = await getSiteFromHeaders()
    
    if (!siteSuccess || !site) {
      return {
        title: 'Content Not Found',
        description: 'The requested content could not be found.',
      }
    }
    
    // Use universal path resolver to find content
    const resolution = await resolveUrlPath(site.id, urlPath)
    
    if (!resolution.success || !resolution.resolution) {
      return {
        title: 'Content Not Found',
        description: 'The requested content could not be found.',
      }
    }
    
    const { type, content } = resolution.resolution
    
    // Generate metadata based on content type
    switch (type) {
      case 'page':
        // For pages, get title from blocks if available
        const { success: pageSuccess, site: siteWithBlocks } = await getSiteFromHeaders(urlPath)
        if (pageSuccess && siteWithBlocks) {
          const heroBlock = siteWithBlocks.blocks?.find(block => block.type === 'hero')
          const pageTitle = heroBlock?.content?.title || content.title || 'Untitled Page'
          const pageDescription = heroBlock?.content?.subtitle || ''
          
          return {
            title: `${pageTitle} | ${site.name}`,
            description: pageDescription || `Welcome to ${site.name}`,
          }
        }
        return {
          title: `${content.title} | ${site.name}`,
          description: `Visit ${content.title} on ${site.name}`,
        }
        
      case 'product':
        const productContent = content as ProductWithBlocks
        return {
          title: `${productContent.title} | ${site.name}`,
          description: productContent.description || `${productContent.title} from ${site.name}`,
        }
        
      case 'post':
        return {
          title: `${content.title} | ${site.name}`,
          description: `Read ${content.title} on ${site.name}`,
        }
        
      default:
        return {
          title: 'Content Not Found',
          description: 'The requested content could not be found.',
        }
    }
  } catch (error) {
    return {
      title: 'Content Not Found',
      description: 'The requested content could not be found.',
    }
  }
}