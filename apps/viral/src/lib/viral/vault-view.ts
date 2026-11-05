import type { VaultItem } from "@/lib/viral/vault"
import type { VaultViewFilters } from "@/lib/viral/vault-saved-views"

/**
 * The vault list as the filters say (`workspace/docs/vault.md`). Status and
 * tag combine: an idea shows only when it has both. The search looks in the
 * title, the channel and the notes. A picked project keeps the list to it.
 */
export function filterVaultItems(items: VaultItem[], filters: VaultViewFilters): VaultItem[] {
  const words = filters.q?.trim().toLowerCase() ?? ""
  const tag = filters.tag?.toLowerCase() ?? ""
  return items.filter((item) => {
    if (filters.project && item.projectId !== filters.project) return false
    if (filters.status && item.status !== filters.status) return false
    if (tag && !item.tags.some((one) => one.toLowerCase() === tag)) return false
    if (!words) return true
    return [item.title, item.channelName, item.notes].some((text) => text.toLowerCase().includes(words))
  })
}
