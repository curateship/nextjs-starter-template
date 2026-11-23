const MAX_DELETION_TARGETS = 100
const MAX_DELETION_TARGET_ID_LENGTH = 1024

export const SITE_DELETION_IMPACT_TARGETS = [
  "ai-automation",
  "category",
  "form",
  "form-delete",
  "listing",
  "newsletter-automation",
  "product",
  "saved-collection",
  "segment",
  "site",
  "sponsor",
] as const

export type SiteDeletionImpactTarget = (typeof SITE_DELETION_IMPACT_TARGETS)[number]
export type DeletionImpactRequest =
  | { ids: string[]; siteId: string; target: SiteDeletionImpactTarget }
  | { ids: string[]; target: "user" }

export type DestructiveImpact = { label: string; count: number }
export type DestructiveImpactResult = { data: DestructiveImpact[] | null; error: string | null }

export function isDeletionImpactRequest(value: unknown): value is DeletionImpactRequest {
  if (!value || typeof value !== "object") return false

  const request = value as Record<string, unknown>
  if (
    !Array.isArray(request.ids)
    || request.ids.length === 0
    || request.ids.length > MAX_DELETION_TARGETS
    || request.ids.some((id) => typeof id !== "string" || id.length > MAX_DELETION_TARGET_ID_LENGTH)
  ) return false

  if (request.target === "user") return true

  return typeof request.siteId === "string"
    && SITE_DELETION_IMPACT_TARGETS.includes(request.target as SiteDeletionImpactTarget)
}

export function serializeDeletionImpactIds(ids: string[]) {
  return JSON.stringify(ids)
}

export function deserializeDeletionImpactIds(value: string) {
  try {
    const ids: unknown = JSON.parse(value)
    return Array.isArray(ids) && ids.every((id) => typeof id === "string") ? ids : []
  } catch {
    return []
  }
}
