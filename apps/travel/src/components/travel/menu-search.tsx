import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"

/**
 * A middle panel's search box, opened from the panel's ⋮ rather than from a
 * magnifying glass of its own (the Admin 3 panel design: "The ⋮ holds Search
 * and Mass select. They are not buttons in the header"; Tyler, 6 Nov 2026).
 * It shows while `open` or while something is typed, with the cursor in it.
 * Leaving it empty closes it, and Escape empties and closes it, as the
 * shell's `SearchToggle` does. That one carries its own button, which this
 * design moves into the menu, and is a shell file, so this is Travel's.
 */
export function MenuSearch({
  open,
  onOpenChange,
  name,
  label,
  placeholder,
  value,
  onChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  if (!open && !value) return null
  return (
    <DashboardToolbarSearch
      autoFocus={open}
      inputClassName="sm:w-44 lg:w-48"
      name={name}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onOpenChange(false)}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        onChange("")
        onOpenChange(false)
      }}
    />
  )
}
