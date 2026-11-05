import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import type { SavedViewValues } from "@/lib/saved-views"
import { cleanTag, VAULT_STATUSES, vaultStatusLabels, type VaultStatus } from "@/lib/viral/vault"

/**
 * Saved views on the Vault page's middle panel (`viral-vault:` in the shell's
 * saved views; the record part is empty, because the page is every project's
 * vault). A view keeps the search, the status, the tag and the project picked.
 */

export const VAULT_SAVED_VIEW_KIND = "viral-vault"

export type VaultViewFilters = {
  q?: string
  status?: VaultStatus
  tag?: string
  project?: string
}

export function vaultViewFilters(values: SavedViewValues): VaultViewFilters {
  const kept: VaultViewFilters = {}
  const q = readSearchText(values.q)?.trim()
  if (q) kept.q = q
  const status = readOneOf(values.status, VAULT_STATUSES)
  if (status) kept.status = status
  const tag = typeof values.tag === "string" ? cleanTag(values.tag) : ""
  if (tag) kept.tag = tag
  const project = typeof values.project === "string" && /^[\w-]{1,36}$/.test(values.project) ? values.project : ""
  if (project) kept.project = project
  return kept
}

/** `"hooks" · Scripted · Tag: Q1` */
export function describeVaultView(filters: VaultViewFilters) {
  const parts: string[] = []
  if (filters.q) parts.push(`"${filters.q}"`)
  if (filters.status) parts.push(vaultStatusLabels[filters.status])
  if (filters.tag) parts.push(`Tag: ${filters.tag}`)
  return parts.join(" · ")
}
