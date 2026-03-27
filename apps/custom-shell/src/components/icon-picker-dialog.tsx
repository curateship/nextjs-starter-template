"use client"

import * as React from "react"
import { CheckIcon, SearchIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { iconMeta, renderShellIcon, type IconKey } from "@/lib/custom-shell"

type IconPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: IconKey
  onSelect: (icon: IconKey) => void
}

export function IconPickerDialog({
  open,
  onOpenChange,
  value,
  onSelect,
}: IconPickerDialogProps) {
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    if (!open) {
      setSearch("")
    }
  }, [open])

  const filteredIcons = (Object.keys(iconMeta) as IconKey[]).filter((key) => {
    const haystack = `${key} ${iconMeta[key].label}`.toLowerCase()
    return haystack.includes(search.trim().toLowerCase())
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick an icon</DialogTitle>
          <DialogDescription>
            Search the shared icon registry and apply the icon to the selected
            sidebar item.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search icons"
            className="pl-9"
          />
        </div>

        <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {filteredIcons.map((key) => {
            const isActive = value === key

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onSelect(key)
                  onOpenChange(false)
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                  isActive
                    ? "border-primary bg-primary/5 text-foreground"
                    : "hover:bg-muted/50"
                )}
              >
                <div className="flex size-9 items-center justify-center rounded-lg border bg-background">
                  {renderShellIcon(key)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {iconMeta[key].label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {key}
                  </p>
                </div>
                {isActive ? <CheckIcon className="size-4 text-primary" /> : null}
              </button>
            )
          })}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
