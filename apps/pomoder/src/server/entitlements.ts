export type SubscriptionState = {
  status: string
  currentPeriodEnd: Date | null
}

export type Entitlements = {
  plan: "free" | "pro"
  canHostRooms: boolean
  canUsePremiumMedia: boolean
  canUploadMedia: boolean
  storageLimitBytes: number
  monthlyBackgrounds: number
  monthlySoundscapes: number
}

export function getEntitlements(subscription: SubscriptionState | null, timestamp = new Date()): Entitlements {
  const periodIsCurrent = Boolean(subscription?.currentPeriodEnd && subscription.currentPeriodEnd > timestamp)
  const isPro = Boolean(subscription && periodIsCurrent && ["active", "past_due"].includes(subscription.status))
  return isPro
    ? { plan: "pro", canHostRooms: true, canUsePremiumMedia: true, canUploadMedia: true, storageLimitBytes: 2 * 1024 * 1024 * 1024, monthlyBackgrounds: 5, monthlySoundscapes: 20 }
    : { plan: "free", canHostRooms: false, canUsePremiumMedia: false, canUploadMedia: false, storageLimitBytes: 0, monthlyBackgrounds: 0, monthlySoundscapes: 0 }
}
