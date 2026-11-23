import * as React from "react"
import { SearchIcon } from "lucide-react"

import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { cn } from "@/lib/utils"

/**
 * A middle panel's search box, always in the header (Tyler, 16 Nov 2026:
 * "move the mass select and search outside", out of the ⋮ it sat in from
 * 6 Nov). Escape empties it. In a header under 672px wide, as on a phone,
 * the box would squeeze the tabs, so it shows as a magnifying glass there
 * and opens into the box, with the cursor in it, while it is used or holds
 * words.
 */
export function HeaderSearch({
  name,
  label,
  placeholder,
  value,
  onChange,
}: {
  name: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const box = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (open) box.current?.focus()
  }, [open])
  const showBox = open || Boolean(value)
  return (
    <>
      <DashboardToolbarSearch
        ref={box}
        className={cn("min-w-0 shrink", !showBox && "@max-2xl:hidden")}
        inputClassName="sm:w-40 lg:w-48"
        name={name}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          if (value) onChange("")
          setOpen(false)
        }}
      />
      {showBox ? null : (
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className="hidden w-8 px-0 @max-2xl:inline-flex"
          aria-label={label}
          onClick={() => setOpen(true)}
        >
          <SearchIcon className="size-4" />
        </DashboardToolbarButton>
      )}
    </>
  )
}
