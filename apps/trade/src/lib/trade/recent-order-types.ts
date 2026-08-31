import { z } from "zod"

export const RECENT_ORDER_TYPES = ["buy", "sell", "dca", "grid"] as const

export type RecentOrderType = (typeof RECENT_ORDER_TYPES)[number]

type RecentOrderStorage = Pick<Storage, "getItem" | "setItem">

const STORAGE_PREFIX = "trade-recent-order-types:"

const recentOrderTypesSchema = z.array(z.enum(RECENT_ORDER_TYPES)).max(4)

/** A saved value through one reader. Bad or old data means no recent rows. */
export function readRecentOrderTypes(value: unknown): RecentOrderType[] {
  const parsed = recentOrderTypesSchema.safeParse(value)
  if (!parsed.success) return []
  return [...new Set(parsed.data)]
}

/** Move the latest placed order to the front and keep each kind only once. */
export function withRecentOrderType(
  current: readonly RecentOrderType[],
  latest: RecentOrderType
): RecentOrderType[] {
  return [latest, ...current.filter((one) => one !== latest)].slice(
    0,
    RECENT_ORDER_TYPES.length
  )
}

/** Read this account's recent kinds from this browser. */
export function loadRecentOrderTypes(
  accountId: string,
  storage: RecentOrderStorage | null = browserStorage()
): RecentOrderType[] {
  if (!storage) return []
  try {
    const saved = storage.getItem(`${STORAGE_PREFIX}${accountId}`)
    return readRecentOrderTypes(saved ? JSON.parse(saved) : [])
  } catch {
    return []
  }
}

/** Keep the shortcut local to the signed-in account on this browser. */
export function saveRecentOrderTypes(
  accountId: string,
  recent: readonly RecentOrderType[],
  storage: RecentOrderStorage | null = browserStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(
      `${STORAGE_PREFIX}${accountId}`,
      JSON.stringify(readRecentOrderTypes(recent))
    )
  } catch {
    // Losing a shortcut must never interrupt an order.
  }
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}
