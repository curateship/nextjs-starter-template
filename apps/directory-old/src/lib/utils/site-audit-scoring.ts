/**
 * Site audit scoring engine — calculates a 0-100 score from site + content data.
 * No DB queries — receives all data as arguments.
 */

interface SiteData {
  name: string
  subdomain: string
  custom_domain?: string | null
  settings?: any
}

interface ContentItem {
  id: string
  title?: string
  slug?: string
  meta_description?: string | null
  metaDescription?: string | null
  featured_image?: string | null
  featuredImage?: string | null
  image?: string | null
  type: string // 'page' | 'post' | 'product' | 'category' | 'directory' | 'event'
  is_published?: boolean
  isPublished?: boolean
}

interface AuditIssue {
  severity: 'critical' | 'warning' | 'info'
  message: string
  category: 'site_settings' | 'content' | 'technical'
  count?: number
  fixAction?: string
}

interface InternalLinkData {
  orphanCount: number
  brokenLinkCount: number
  totalLinks: number
}

interface AuditScoreResult {
  totalScore: number
  siteSettingsScore: number
  contentScore: number
  technicalScore: number
  issues: AuditIssue[]
}

/**
 * Calculate the full audit score for a site
 */
export function calculateAuditScore(
  site: SiteData,
  publishedContent: ContentItem[],
  linkData?: InternalLinkData
): AuditScoreResult {
  const issues: AuditIssue[] = []
  const settings = site.settings || {}

  // === Site Settings Score (30 points max) ===
  let siteSettingsScore = 0

  // Home page description set (5pt)
  if (settings.seo_home_description || settings.seo_site_description) {
    siteSettingsScore += 5
  } else {
    issues.push({ severity: 'warning', message: 'No home page description set', category: 'site_settings', fixAction: 'Set a home page meta description in SEO settings' })
  }

  // Default OG image set (5pt)
  if (settings.seo_default_og_image) {
    siteSettingsScore += 5
  } else {
    issues.push({ severity: 'critical', message: 'No default Open Graph image configured', category: 'site_settings', fixAction: 'Upload a default OG image in SEO settings' })
  }

  // Favicon configured (3pt)
  if (settings.favicon) {
    siteSettingsScore += 3
  } else {
    issues.push({ severity: 'warning', message: 'No favicon configured', category: 'site_settings', fixAction: 'Upload a favicon in Site Settings' })
  }

  // Google verification set (2pt)
  if (settings.seo_google_verification) {
    siteSettingsScore += 2
  } else {
    issues.push({ severity: 'info', message: 'Google Search Console not verified', category: 'site_settings', fixAction: 'Add Google verification code in SEO settings' })
  }

  // Canonical domain configured (3pt)
  if (settings.seo_canonical_domain) {
    siteSettingsScore += 3
  } else {
    issues.push({ severity: 'warning', message: 'Canonical domain not configured', category: 'site_settings', fixAction: 'Set your preferred canonical domain in SEO settings' })
  }

  // Organization name + logo set (4pt)
  if (settings.seo_org_name) siteSettingsScore += 2
  if (settings.seo_org_logo) siteSettingsScore += 2
  if (!settings.seo_org_name && !settings.seo_org_logo) {
    issues.push({ severity: 'warning', message: 'Organization name and logo not set for structured data', category: 'site_settings', fixAction: 'Set organization info in SEO settings' })
  }

  // Twitter handle set (3pt)
  if (settings.seo_twitter_handle) {
    siteSettingsScore += 3
  } else {
    issues.push({ severity: 'info', message: 'Twitter handle not configured', category: 'site_settings', fixAction: 'Add your Twitter handle in SEO settings' })
  }

  // Social links configured (3pt)
  if (settings.seo_org_social_links?.length > 0) {
    siteSettingsScore += 3
  } else {
    issues.push({ severity: 'info', message: 'No social profile links configured', category: 'site_settings', fixAction: 'Add social links in SEO settings' })
  }

  // Custom domain set (2pt)
  if (site.custom_domain) {
    siteSettingsScore += 2
  } else {
    issues.push({ severity: 'info', message: 'No custom domain configured', category: 'site_settings' })
  }

  // === Content Completeness Score (40 points max) ===
  let contentScore = 0
  const totalContent = publishedContent.length

  if (totalContent > 0) {
    // % of content with meta descriptions (15pt)
    const withMetaDesc = publishedContent.filter(c =>
      (c.meta_description || c.metaDescription || '').length > 0
    ).length
    const metaDescRatio = withMetaDesc / totalContent
    const metaDescPoints = Math.round(metaDescRatio * 15)
    contentScore += metaDescPoints
    const missingMetaDesc = totalContent - withMetaDesc
    if (missingMetaDesc > 0) {
      issues.push({ severity: 'critical', message: `${missingMetaDesc} content items missing meta descriptions`, category: 'content', count: missingMetaDesc, fixAction: 'Add meta descriptions to content' })
    }

    // % of content with featured images (10pt)
    const withImages = publishedContent.filter(c =>
      (c.featured_image || c.featuredImage || c.image || '').length > 0
    ).length
    const imageRatio = withImages / totalContent
    contentScore += Math.round(imageRatio * 10)
    const missingImages = totalContent - withImages
    if (missingImages > 0) {
      issues.push({ severity: 'warning', message: `${missingImages} content items missing featured images`, category: 'content', count: missingImages })
    }

    // % of titles in ideal length 30-60 chars (8pt)
    const idealTitles = publishedContent.filter(c => {
      const len = (c.title || '').length
      return len >= 30 && len <= 60
    }).length
    contentScore += Math.round((idealTitles / totalContent) * 8)
    const badTitles = totalContent - idealTitles
    if (badTitles > 0) {
      issues.push({ severity: 'warning', message: `${badTitles} titles outside ideal length (30-60 chars)`, category: 'content', count: badTitles })
    }

    // % of meta descriptions in ideal length 120-160 chars (7pt)
    const itemsWithDesc = publishedContent.filter(c =>
      (c.meta_description || c.metaDescription || '').length > 0
    )
    if (itemsWithDesc.length > 0) {
      const idealDescs = itemsWithDesc.filter(c => {
        const len = (c.meta_description || c.metaDescription || '').length
        return len >= 120 && len <= 160
      }).length
      contentScore += Math.round((idealDescs / itemsWithDesc.length) * 7)
      const badDescs = itemsWithDesc.length - idealDescs
      if (badDescs > 0) {
        issues.push({ severity: 'info', message: `${badDescs} meta descriptions outside ideal length (120-160 chars)`, category: 'content', count: badDescs })
      }
    }
  } else {
    issues.push({ severity: 'info', message: 'No published content found', category: 'content' })
  }

  // === Technical Score (30 points max) ===
  let technicalScore = 0

  // Sitemap exists (5pt) — always true in our setup
  technicalScore += 5
  issues.push({ severity: 'info', message: 'Sitemap is configured', category: 'technical' })

  // Robots.txt configured (3pt) — always true after Phase 2C
  technicalScore += 3

  // OG tags infrastructure (5pt) — always true after Phase 2A
  technicalScore += 5

  // JSON-LD structured data (5pt) — always true after Phase 2B
  technicalScore += 5

  // Canonical URLs configured (4pt)
  if (settings.seo_canonical_domain || site.custom_domain) {
    technicalScore += 4
  } else {
    issues.push({ severity: 'warning', message: 'Canonical URLs not fully configured', category: 'technical', fixAction: 'Set canonical domain preference in SEO settings' })
  }

  // No orphan pages (4pt, scaled)
  if (linkData) {
    if (totalContent > 0) {
      const linkedRatio = Math.max(0, 1 - (linkData.orphanCount / totalContent))
      technicalScore += Math.round(linkedRatio * 4)
      if (linkData.orphanCount > 0) {
        issues.push({ severity: 'warning', message: `${linkData.orphanCount} orphan pages with no incoming internal links`, category: 'technical', count: linkData.orphanCount })
      }
    } else {
      technicalScore += 4
    }

    // No broken internal links (4pt, scaled)
    if (linkData.totalLinks > 0) {
      const healthyRatio = Math.max(0, 1 - (linkData.brokenLinkCount / linkData.totalLinks))
      technicalScore += Math.round(healthyRatio * 4)
      if (linkData.brokenLinkCount > 0) {
        issues.push({ severity: 'critical', message: `${linkData.brokenLinkCount} broken internal links found`, category: 'technical', count: linkData.brokenLinkCount })
      }
    } else {
      technicalScore += 4
    }
  } else {
    // No link data available — give partial credit
    technicalScore += 4
  }

  const totalScore = siteSettingsScore + contentScore + technicalScore

  return {
    totalScore,
    siteSettingsScore,
    contentScore,
    technicalScore,
    issues,
  }
}
