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
    instagram?: string
    facebook?: string
    tiktok?: string
    twitter?: string
    linkedin?: string
    youtube?: string
    featuredImage?: string
    mapsUrl?: string
  }
  sources?: {
    googleMaps?: {
      importedAt?: string
    }
  }
}
