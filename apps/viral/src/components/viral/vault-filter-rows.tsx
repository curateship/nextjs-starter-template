import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { VAULT_STATUSES, vaultStatusLabels, type VaultStatus } from "@/lib/viral/vault"
import type { VaultShowAs, VaultViewFilters } from "@/lib/viral/vault-saved-views"

const ANY = "any"

export type VaultFilterPatch = { status?: VaultStatus; tag?: string; show?: VaultShowAs }

/** A filter row's change as the address keeps it: List is the default, so it is left out. */
export function vaultSearchPatch(patch: VaultFilterPatch): Omit<VaultViewFilters, "q" | "project"> {
  const { show, ...rest } = patch
  return "show" in patch ? { ...rest, show: show === "board" ? "board" : undefined } : rest
}

/**
 * The vault's Filter (`workspace/docs/vault.md`): Status and Tag, which
 * combine, then Show as, List or Board (Tyler: "List or Board switch").
 * Drawn in Filter on the Viral dashboard's Vault row and in a saved view's
 * edit window, stacked to fit Filter's 240px.
 */
export function VaultFilterRows({
  idPrefix,
  values,
  tags,
  onChange,
}: {
  idPrefix: string
  values: VaultViewFilters
  tags: string[]
  onChange: (patch: VaultFilterPatch) => void
}) {
  // A tag kept in a view but no longer on any idea still shows, so it can be cleared.
  const tagChoices = values.tag && !tags.includes(values.tag) ? [values.tag, ...tags] : tags
  return (
    <>
      <FilterRow id={`${idPrefix}-status`} label="Status">
        <Select value={values.status ?? ANY} onValueChange={(next) => onChange({ status: next === ANY ? undefined : (next as VaultStatus) })}>
          <SelectTrigger id={`${idPrefix}-status`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any status</SelectItem>
            {VAULT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {vaultStatusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-tag`} label="Tag">
        <Select value={values.tag ?? ANY} onValueChange={(next) => onChange({ tag: next === ANY ? undefined : next })}>
          <SelectTrigger id={`${idPrefix}-tag`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any tag</SelectItem>
            {tagChoices.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
      <FilterRow id={`${idPrefix}-show`} label="Show as">
        <Select value={values.show ?? "list"} onValueChange={(next) => onChange({ show: next as VaultShowAs })}>
          <SelectTrigger id={`${idPrefix}-show`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="list">List</SelectItem>
            <SelectItem value="board">Board</SelectItem>
          </SelectContent>
        </Select>
      </FilterRow>
    </>
  )
}
