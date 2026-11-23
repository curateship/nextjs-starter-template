export type Metadata = Record<string, unknown>

export type RobotsMetadata = {
  rules: Array<{ userAgent: string; allow?: string; disallow?: string[] }>
  sitemap?: string
}
