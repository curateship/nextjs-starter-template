import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { DashboardToolbarSelectTrigger } from "@/components/shared/dashboard-toolbar"
import { ALL, NONE } from "@/lib/browser/sorting"

/**
 * The folder, label and tag filters, shared by the Browser profiles and
 * Phones dashboards, which sort with the same folders, labels and tags.
 */

/** One of the list's filters: all, none, or one of the options. */
export function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  noneLabel,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  allLabel: string
  noneLabel?: string
  options: Array<{ id: string; name: string }>
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      {/* Off on a phone, where three filters left the search box no room. */}
      <DashboardToolbarSelectTrigger
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="hidden sm:flex"
      >
        <SelectValue />
      </DashboardToolbarSelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {noneLabel ? <SelectItem value={NONE}>{noneLabel}</SelectItem> : null}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
