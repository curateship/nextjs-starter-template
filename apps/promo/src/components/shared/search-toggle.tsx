import { SearchIcon } from "lucide-react"
import * as React from "react"

import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * A three-column dashboard's search: a magnifying glass in the middle header
 * that opens into the box. It stays open while something is typed; Escape
 * empties and closes it. Project's task header is where it started.
 */
export function SearchToggle({
  name,
  label,
  placeholder,
  value,
  onChange,
}: {
  /** The box's form name, such as `contact-search`. */
  name: string
  /** What the box searches, read out and shown on hover: "Search contacts". */
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  if (open || value) {
    return (
      <DashboardToolbarSearch
        autoFocus={open}
        inputClassName="sm:w-44 lg:w-48"
        name={name}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          onChange("")
          setOpen(false)
        }}
      />
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DashboardToolbarButton
          type="button"
          variant="ghost"
          className="w-8 px-0"
          aria-label={label}
          onClick={() => setOpen(true)}
        >
          <SearchIcon className="size-4" />
        </DashboardToolbarButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
