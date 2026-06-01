export interface DirectoryData {
  fields?: {
    businessName?: string
    description?: string
    phone?: string
    website?: string
    address?: string
    rating?: number
    reviewCount?: number
    category?: string
    categoryName?: string
    type?: string
    neighborhood?: string
    city?: string
    region?: string
    country?: string
    featuredImage?: string
    mapsUrl?: string
  }
  sources?: {
    googleMaps?: {
      importedAt?: string
    }
  }
}
