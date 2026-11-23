// The ten kinds of admin notification, with the plain-English words the
// settings screen shows for each. This file stays free of server imports so
// client components can read it.

export const NOTIFICATION_KINDS = [
  {
    type: 'product_order',
    label: 'Product orders',
    description: 'Someone buys or downloads a product from your store.',
  },
  {
    type: 'directory_claim',
    label: 'Listing claims',
    description: 'Someone asks to take ownership of a listing.',
  },
  {
    type: 'directory_owner_edit',
    label: 'Owner edits',
    description: 'A listing owner changes their listing.',
  },
  {
    type: 'directory_featured',
    label: 'Featured placements',
    description: 'A listing pays to be featured on your site.',
  },
  {
    type: 'directory_featured_expired',
    label: 'Featured placements ending',
    description: 'A paid featured placement runs out.',
  },
  {
    type: 'newsletter_paused',
    label: 'Newsletter problems',
    description: 'A newsletter stops sending because something went wrong.',
  },
  {
    type: 'event_submission',
    label: 'Event submissions',
    description: 'Someone submits an event for you to approve.',
  },
  {
    type: 'directory_submission',
    label: 'Listing submissions',
    description: 'Someone submits a new listing for you to approve.',
  },
  {
    type: 'event_registration',
    label: 'Event signups',
    description: 'Someone signs up for or buys a ticket to an event.',
  },
  {
    type: 'automation_approval',
    label: 'Automation approvals',
    description: 'An automation pauses and waits for your go-ahead.',
  },
] as const

export type HubNotificationType = (typeof NOTIFICATION_KINDS)[number]['type']

export function isHubNotificationType(value: string): value is HubNotificationType {
  return NOTIFICATION_KINDS.some((kind) => kind.type === value)
}

type MutedPreference = {
  userId: string
  type: string
  enabled: boolean
}

/**
 * Which of these people should receive a notification of this kind? A person
 * with no saved preference gets it — absent always means on, so nothing
 * important goes quiet by accident. Only a row that explicitly says
 * `enabled: false` for this exact kind mutes that one person.
 */
export function pickNotificationRecipients<T extends { id: string }>(
  recipients: T[],
  preferences: MutedPreference[],
  type: string
): T[] {
  const muted = new Set(
    preferences
      .filter((preference) => preference.type === type && !preference.enabled)
      .map((preference) => preference.userId)
  )

  if (muted.size === 0) return recipients
  return recipients.filter((recipient) => !muted.has(recipient.id))
}
