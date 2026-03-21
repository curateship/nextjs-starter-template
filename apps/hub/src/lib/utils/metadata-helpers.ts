import { getSiteFromHeaders } from './site-resolver'

export async function generateSiteMetadata(pageTitle: string, pageDescription: string) {
  try {
    const { success, site } = await getSiteFromHeaders()
    
    if (!success || !site) {
      return {
        title: pageTitle,
        description: pageDescription,
      }
    }
    
    return {
      title: `${pageTitle} | ${site.name}`,
      description: pageDescription,
    }
  } catch (error) {
    return {
      title: pageTitle,
      description: pageDescription,
    }
  }
}

export async function generatePageMetadata(pageTitle: string, pageDescription: string, fallbackTitle?: string) {
  return generateSiteMetadata(
    pageTitle, 
    pageDescription || `Visit ${pageTitle}`
  )
}