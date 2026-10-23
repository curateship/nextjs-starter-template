export const ACCOUNT_MENU_ACTION_ITEM_ID = "account-menu"
export const DARK_MODE_ACTION_ITEM_ID = "dark-mode"

export const BUILT_IN_NAVIGATION_ACTION_ITEM_IDS = [
  ACCOUNT_MENU_ACTION_ITEM_ID,
  DARK_MODE_ACTION_ITEM_ID,
] as const

export type BuiltInNavigationActionItemId =
  (typeof BUILT_IN_NAVIGATION_ACTION_ITEM_IDS)[number]

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isBuiltInNavigationActionItemId(
  value: unknown
): value is BuiltInNavigationActionItemId {
  return BUILT_IN_NAVIGATION_ACTION_ITEM_IDS.includes(
    value as BuiltInNavigationActionItemId
  )
}

export function getSavedNavigationButtonIds(buttons: unknown): string[] {
  if (!Array.isArray(buttons)) return []

  const ids: string[] = []
  const seen = new Set<string>()

  for (const button of buttons) {
    if (!button || typeof button !== "object") continue

    const id = "id" in button ? button.id : undefined
    if (!isNonEmptyString(id) || seen.has(id)) continue

    seen.add(id)
    ids.push(id)
  }

  return ids
}

export function getResolvedNavigationButtonId(
  button: { id?: string | null },
  index: number
) {
  return isNonEmptyString(button.id) ? button.id : `legacy-button-${index}`
}

export function normalizeNavigationActionItemOrder(
  actionItemOrder: unknown,
  buttonIds: string[]
): string[] {
  const normalizedButtonIds = buttonIds.filter(isNonEmptyString)
  const buttonIdSet = new Set(normalizedButtonIds)
  const nextOrder: string[] = []
  const seen = new Set<string>()

  if (Array.isArray(actionItemOrder)) {
    for (const entry of actionItemOrder) {
      if (!isNonEmptyString(entry) || seen.has(entry)) continue
      if (!buttonIdSet.has(entry) && !isBuiltInNavigationActionItemId(entry)) continue

      seen.add(entry)
      nextOrder.push(entry)
    }
  }

  for (const buttonId of normalizedButtonIds) {
    if (seen.has(buttonId)) continue
    seen.add(buttonId)
    nextOrder.push(buttonId)
  }

  for (const actionItemId of BUILT_IN_NAVIGATION_ACTION_ITEM_IDS) {
    if (seen.has(actionItemId)) continue
    seen.add(actionItemId)
    nextOrder.push(actionItemId)
  }

  return nextOrder
}
