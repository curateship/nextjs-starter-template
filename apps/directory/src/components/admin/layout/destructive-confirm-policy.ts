export type DestructiveLevel = 1 | 2 | 3

type DestructiveActionPolicy = {
  level: DestructiveLevel
  consequence: string
}

export const DESTRUCTIVE_ACTION_POLICIES = {
  "archive-form": { level: 1, consequence: "The form stops accepting public submissions but keeps its existing submissions." },
  "delete-account-page": { level: 1, consequence: "The account page and its configured content are permanently deleted." },
  "delete-ai-automation": { level: 2, consequence: "The workflow, its run history, node results, and scraped-source state are permanently deleted." },
  "delete-automation-node": { level: 1, consequence: "The automation node is permanently deleted." },
  "delete-automation-trigger": { level: 1, consequence: "The trigger is removed and will no longer enroll contacts." },
  "delete-block": { level: 1, consequence: "The block is removed from this draft." },
  "delete-campaign": { level: 1, consequence: "The campaign and its counters are permanently deleted." },
  "delete-category": { level: 2, consequence: "The category, its child categories, and content assignments are permanently deleted." },
  "delete-contact": { level: 1, consequence: "The contact and its audience memberships are permanently deleted." },
  "delete-directory-custom-block": { level: 1, consequence: "The custom block definition is permanently deleted." },
  "delete-event": { level: 1, consequence: "The event and its configured content are permanently deleted." },
  "delete-form": { level: 2, consequence: "The form, its published versions, and every submission it has collected are permanently deleted." },
  "delete-listing": { level: 2, consequence: "The listing, saved-list references, claims, and Featured placements are permanently deleted." },
  "delete-media": { level: 1, consequence: "The media file is permanently removed from the library." },
  "delete-newsletter": { level: 1, consequence: "The newsletter and its configured content are permanently deleted." },
  "delete-newsletter-automation": { level: 2, consequence: "The automation, its steps, and enrollments are permanently deleted." },
  "delete-order": { level: 1, consequence: "The order record is permanently deleted." },
  "delete-page": { level: 1, consequence: "The page and its configured content are permanently deleted." },
  "delete-post": { level: 1, consequence: "The post and its configured content are permanently deleted." },
  "delete-product": { level: 2, consequence: "The product and its order records are permanently deleted." },
  "delete-saved-collection": { level: 2, consequence: "The folder and every saved listing in it are permanently removed." },
  "delete-segment": { level: 2, consequence: "The segment and its contact memberships are permanently deleted." },
  "delete-sidebar-section": { level: 1, consequence: "The section and every link in it disappear from the admin sidebar. This saves automatically." },
  "delete-site": { level: 3, consequence: "The site and all site-owned content, audiences, orders, media, and settings are permanently deleted." },
  "delete-site-user": { level: 1, consequence: "The user loses access to this site; their platform account remains." },
  "delete-sponsor": { level: 2, consequence: "The sponsor is permanently deleted and existing embeds stop rendering." },
  "delete-tag": { level: 1, consequence: "The tag is permanently deleted and removed from assigned contacts." },
  "delete-template": { level: 1, consequence: "The template and its configured blocks are permanently deleted." },
  "delete-theme": { level: 1, consequence: "The theme is permanently deleted." },
  "delete-user": { level: 3, consequence: "The platform account, authentication records, and owned sites and media are permanently deleted." },
  "remove-event-registration": { level: 1, consequence: "The person is taken off the attendee list and their seat is freed. A paid ticket is not refunded automatically." },
  "remove-saved-listing": { level: 1, consequence: "The listing is removed from this saved folder." },
  "reset-admin-sidebar": { level: 1, consequence: "Every sidebar section and link goes back to the default layout. Custom links and renames are lost. This saves automatically." },
  "revoke-featured-placement": { level: 1, consequence: "The listing immediately loses its Featured badge and priority placement. Refunds are handled manually in Stripe." },
  "remove-segment-contact": { level: 1, consequence: "The contact is removed from this segment but remains in the audience." },
} as const satisfies Record<string, DestructiveActionPolicy>

export type DestructiveAction = keyof typeof DESTRUCTIVE_ACTION_POLICIES

export function matchesDestructiveConfirmation(value: string, expected: string) {
  return value.trim() === expected
}

export function getDestructiveConfigurationError(
  level: DestructiveLevel,
  hasImpactRequest: boolean,
  confirmationName?: string,
) {
  if (level > 1 && !hasImpactRequest) {
    return "Deletion impact is unavailable. This action cannot continue."
  }
  if (level === 3 && !confirmationName) {
    return "Confirmation name is unavailable. This action cannot continue."
  }
  return null
}

export function isDestructiveConfirmDisabled({
  configurationError,
  confirming,
  disabled,
  impactError,
  loadingImpact,
  confirmationMatches,
}: {
  configurationError: string | null
  confirming: boolean
  disabled: boolean
  impactError: string | null
  loadingImpact: boolean
  confirmationMatches: boolean
}) {
  return disabled
    || confirming
    || loadingImpact
    || Boolean(impactError)
    || Boolean(configurationError)
    || !confirmationMatches
}
