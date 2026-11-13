import { FilterRow } from "@/components/admin-dashboard/list-parts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** The value of a pick's first choice, "any of them". */
const ALL = "all"

/**
 * One of a Flowfly tab's Filter rows: a label, then a select whose first choice
 * is "any". Copied from Promo's dashboards (`apps/promo/src/components/dashboard-page/filter-pick.tsx`).
 */
export function FilterPick<T extends string>({
  id,
  label,
  value,
  any,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T | undefined
  any: string
  options: [string, string][]
  onChange: (value: T | undefined) => void
}) {
  return (
    <FilterRow id={id} label={label}>
      <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? undefined : (next as T))}>
        <SelectTrigger id={id} className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{any}</SelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>
              {optionLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRow>
  )
}
