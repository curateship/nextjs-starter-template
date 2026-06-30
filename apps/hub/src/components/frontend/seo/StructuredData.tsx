import { buildSiteUrl } from '@/lib/utils/seo-helpers'
import { toCdnUrl } from '@/lib/utils/cdn'

// Minimal site shape for structured data
interface StructuredDataSite {
  id: string
  name: string
  subdomain: string
  custom_domain?: string | null
  customDomain?: string | null
  settings?: any
}

interface StructuredDataContent {
  title?: string
  slug?: string
  description?: string
  meta_description?: string
  metaDescription?: string
  excerpt?: string
  featured_image?: string
  featuredImage?: string
  image?: string
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
  // Product-specific
  price?: number | string
  // Event-specific
  start_date?: string
  startDate?: string
  end_date?: string
  endDate?: string
  location?: string
  venue?: string
  venueName?: string
  venueAddress?: string
}

type ContentType = 'home' | 'page' | 'post' | 'product' | 'category' | 'directory' | 'event'

interface StructuredDataProps {
  site: StructuredDataSite
  content?: StructuredDataContent | null
  contentType: ContentType
}

/**
 * Renders structured data as a JSON-LD script tag.
 * Supports Organization (site-wide), Article, Product, Event, and WebPage schemas.
 */
export function StructuredData({ site, content, contentType }: StructuredDataProps) {
  const baseUrl = buildSiteUrl(site)
  const schemas: any[] = []

  // Organization schema (always included)
  const orgSchema: any = {
    '@type': 'Organization',
    name: site.settings?.seo_org_name || site.name,
    url: baseUrl,
  }
  if (site.settings?.seo_org_logo) {
    orgSchema.logo = toCdnUrl(site.settings.seo_org_logo)
  }
  if (site.settings?.seo_org_social_links?.length) {
    orgSchema.sameAs = site.settings.seo_org_social_links
  }
  schemas.push(orgSchema)

  // Content-specific schema
  if (content && contentType !== 'home') {
    const contentUrl = `${baseUrl}/${contentType === 'post' ? 'posts' : contentType === 'product' ? 'products' : contentType === 'category' ? 'categories' : contentType === 'directory' ? 'directory' : contentType === 'event' ? 'events' : 'pages'}/${content.slug || ''}`
    const description = content.meta_description || content.metaDescription || content.description || content.excerpt || ''
    const cleanDescription = description.replace(/<[^>]*>/g, '').trim()
    const image = content.featured_image || content.featuredImage || content.image
    const datePublished = content.created_at || content.createdAt
    const dateModified = content.updated_at || content.updatedAt

    if (contentType === 'post') {
      // Article schema for blog posts
      const article: any = {
        '@type': 'Article',
        headline: content.title,
        url: contentUrl,
        description: cleanDescription,
        publisher: { '@type': 'Organization', name: site.settings?.seo_org_name || site.name },
      }
      if (image) article.image = toCdnUrl(image)
      if (datePublished) article.datePublished = datePublished
      if (dateModified) article.dateModified = dateModified
      schemas.push(article)

    } else if (contentType === 'product') {
      // Product schema
      const product: any = {
        '@type': 'Product',
        name: content.title,
        url: contentUrl,
        description: cleanDescription,
      }
      if (image) product.image = toCdnUrl(image)
      if (content.price) {
        product.offers = {
          '@type': 'Offer',
          price: String(content.price),
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        }
      }
      schemas.push(product)

    } else if (contentType === 'event') {
      // Event schema
      const event: any = {
        '@type': 'Event',
        name: content.title,
        url: contentUrl,
        description: cleanDescription,
      }
      if (image) event.image = toCdnUrl(image)
      const startDate = content.start_date || content.startDate
      const endDate = content.end_date || content.endDate
      if (startDate) event.startDate = startDate
      if (endDate) event.endDate = endDate
      const venueName = typeof content.venueName === 'string' && content.venueName.trim()
        ? content.venueName.trim()
        : content.location || content.venue
      const venueAddress = typeof content.venueAddress === 'string' ? content.venueAddress.trim() : ''
      if (venueName || venueAddress) {
        event.location = { '@type': 'Place' }
        if (venueName) event.location.name = venueName
        if (venueAddress) event.location.address = venueAddress
      }
      event.organizer = { '@type': 'Organization', name: site.settings?.seo_org_name || site.name }
      schemas.push(event)

    } else {
      // WebPage schema for pages, categories, directories
      const webpage: any = {
        '@type': 'WebPage',
        name: content.title,
        url: contentUrl,
        description: cleanDescription,
      }
      if (image) webpage.image = toCdnUrl(image)
      schemas.push(webpage)
    }
  }

  // Wrap in @graph if multiple schemas
  const structuredData = {
    '@context': 'https://schema.org',
    ...(schemas.length === 1 ? schemas[0] : { '@graph': schemas }),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
    />
  )
}
