import { createHash } from "node:crypto"

export function createPublicDirectoryDraftValues({
  createdAt,
  externalId,
  id,
  sourceResultId,
  title,
  data,
  workspaceId,
}: {
  createdAt: Date
  externalId?: string | null
  id: string
  sourceResultId: string | null
  title: string
  data: Record<string, unknown>
  workspaceId: string
}) {
  const slugId = stringValue(data.placeId) || stringValue(data.externalId) || externalId || sourceResultId || id
  const publicData = pickPublicDirectoryData(data)

  return {
    id,
    workspaceId,
    sourceResultId,
    slug: createPublicDirectorySlug(title, slugId),
    status: "draft",
    title: title.trim().slice(0, 255) || "Untitled place",
    metaDescription: stringValue(data.address) || null,
    featuredImage: stringValue(data.featuredImage) || null,
    publicData,
    createdAt,
    updatedAt: createdAt,
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function recordOrUndefined(value: unknown) {
  const next = record(value)
  return Object.keys(next).length ? next : undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function socialLinksValue(value: unknown) {
  if (!Array.isArray(value)) return undefined

  const links = value
    .map((item) => {
      const link = record(item)
      const platform = stringValue(link.platform)
      const url = stringValue(link.url)
      return platform && url ? { platform, url } : null
    })
    .filter((item): item is { platform: string; url: string } => Boolean(item))

  return links.length ? links : undefined
}

function pickPublicDirectoryData(data: Record<string, unknown>) {
  return {
    description: stringValue(data.description),
    address: stringValue(data.address),
    phone: stringValue(data.phone),
    website: stringValue(data.website),
    rating: numberValue(data.rating),
    reviewCount: numberValue(data.reviewCount),
    placeId: stringValue(data.placeId),
    mapsUrl: stringValue(data.mapsUrl),
    socialLinks: socialLinksValue(data.socialLinks),
    openingHours: recordOrUndefined(data.openingHours),
  }
}

function createPublicDirectorySlug(title: string, externalId: string) {
  const suffix = createHash("sha1").update(externalId).digest("hex").slice(0, 8)
  const base = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 91)

  return `${base || "directory"}-${suffix}`
}
