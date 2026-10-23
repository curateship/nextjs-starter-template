import type { Metadata } from "@/lib/metadata"

type MetaDescriptor = Record<string, string>
type LinkDescriptor = Record<string, string>

export type RouteHead = {
  links: LinkDescriptor[]
  meta: MetaDescriptor[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown) {
  if (typeof value === "string") return value
  if (value instanceof URL) return value.toString()
  return null
}

function readTitle(value: unknown) {
  const direct = asString(value)
  if (direct) return direct
  const title = asRecord(value)
  return asString(title?.absolute) || asString(title?.default)
}

function addMeta(meta: MetaDescriptor[], name: string, value: unknown) {
  const content = asString(value)
  if (content) meta.push({ name, content })
}

function addPropertyMeta(meta: MetaDescriptor[], property: string, value: unknown) {
  const content = asString(value)
  if (content) meta.push({ property, content })
}

function imageUrls(value: unknown) {
  const images = Array.isArray(value) ? value : value ? [value] : []
  return images.flatMap((image) => {
    const direct = asString(image)
    if (direct) return [direct]
    const url = asString(asRecord(image)?.url)
    return url ? [url] : []
  })
}

function iconLinks(value: unknown, defaultRel: string): LinkDescriptor[] {
  const icons = Array.isArray(value) ? value : value ? [value] : []
  return icons.flatMap((icon) => {
    const direct = asString(icon)
    if (direct) return [{ rel: defaultRel, href: direct }]
    const record = asRecord(icon)
    const href = asString(record?.url)
    if (!href) return []
    return [{
      rel: asString(record?.rel) || defaultRel,
      href,
      ...(asString(record?.sizes) ? { sizes: asString(record?.sizes)! } : {}),
      ...(asString(record?.type) ? { type: asString(record?.type)! } : {}),
    }]
  })
}

export function metadataToHead(metadata: Metadata): RouteHead {
  const value = asRecord(metadata) || {}
  const meta: MetaDescriptor[] = []
  const links: LinkDescriptor[] = []
  const title = readTitle(value.title)
  if (title) meta.push({ title })
  addMeta(meta, "description", value.description)

  const keywords = Array.isArray(value.keywords)
    ? value.keywords.filter((item): item is string => typeof item === "string").join(", ")
    : value.keywords
  addMeta(meta, "keywords", keywords)

  const robots = asRecord(value.robots)
  if (robots) {
    const directives = [
      robots.index === false ? "noindex" : robots.index === true ? "index" : null,
      robots.follow === false ? "nofollow" : robots.follow === true ? "follow" : null,
    ].filter(Boolean).join(", ")
    addMeta(meta, "robots", directives)
  } else {
    addMeta(meta, "robots", value.robots)
  }

  const verification = asRecord(value.verification)
  addMeta(meta, "google-site-verification", verification?.google)

  const openGraph = asRecord(value.openGraph)
  if (openGraph) {
    addPropertyMeta(meta, "og:title", openGraph.title)
    addPropertyMeta(meta, "og:description", openGraph.description)
    addPropertyMeta(meta, "og:url", openGraph.url)
    addPropertyMeta(meta, "og:site_name", openGraph.siteName)
    addPropertyMeta(meta, "og:type", openGraph.type)
    imageUrls(openGraph.images).forEach((url) => addPropertyMeta(meta, "og:image", url))
  }

  const twitter = asRecord(value.twitter)
  if (twitter) {
    addMeta(meta, "twitter:card", twitter.card)
    addMeta(meta, "twitter:title", twitter.title)
    addMeta(meta, "twitter:description", twitter.description)
    addMeta(meta, "twitter:site", twitter.site)
    imageUrls(twitter.images).forEach((url) => addMeta(meta, "twitter:image", url))
  }

  const alternates = asRecord(value.alternates)
  const canonical = asString(alternates?.canonical)
  if (canonical) links.push({ rel: "canonical", href: canonical })

  const icons = asRecord(value.icons)
  if (icons) {
    links.push(...iconLinks(icons.icon, "icon"))
    links.push(...iconLinks(icons.apple, "apple-touch-icon"))
    links.push(...iconLinks(icons.other, "icon"))
  } else {
    links.push(...iconLinks(value.icons, "icon"))
  }

  return { links, meta }
}
