import * as React from "react"
import {
  CheckIcon,
  ImageIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getShellIconLabel,
  iconMeta,
  normalizeDynamicLucideIconName,
  renderShellIcon,
  type IconKey,
  type ShellIcon,
} from "@/lib/custom-shell"
import { cn } from "@/lib/utils"

const iconOptions = Object.entries(iconMeta).map(([value, meta]) => ({
  value: value as IconKey,
  label: meta.label,
}))

export function ShellIconPicker({
  value,
  onValueChange,
  allowEmpty = false,
  compact = false,
  ghost = false,
}: {
  value?: ShellIcon
  onValueChange: (value: ShellIcon | undefined) => void
  allowEmpty?: boolean
  compact?: boolean
  ghost?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [customIconOpen, setCustomIconOpen] = React.useState(false)
  const [customIconName, setCustomIconName] = React.useState("")
  const currentLabel = getShellIconLabel(value)
  const normalizedQuery = query.trim().toLowerCase()
  const customLucideIcon = normalizeDynamicLucideIconName(customIconName)
  const customIconError =
    customIconName.trim() && !customLucideIcon
      ? "No Lucide icon found with that name."
      : null

  const filteredIcons = React.useMemo(() => {
    if (!normalizedQuery) return iconOptions
    return iconOptions.filter((option) =>
      `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery)
    )
  }, [normalizedQuery])

  function resetPicker() {
    setQuery("")
    setCustomIconOpen(false)
    setCustomIconName("")
  }

  function closePicker() {
    setOpen(false)
    resetPicker()
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) resetPicker()
  }

  function handleCustomIconSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customLucideIcon) return
    onValueChange(customLucideIcon)
    closePicker()
  }

  return (
    <>
      <Button
        type="button"
        variant={ghost ? "ghost" : "outline"}
        size={compact ? "icon" : "default"}
        className={cn(
          !compact && "justify-start",
          !value &&
            "border-dotted border-muted-foreground/30 bg-muted/40 text-muted-foreground/50 hover:bg-muted/60"
        )}
        onClick={() => setOpen(true)}
        aria-label={`Choose icon, current icon ${currentLabel}`}
        title={currentLabel}
      >
        {value ? renderShellIcon(value, "h-4 w-4") : <ImageIcon className="h-4 w-4" />}
        {!compact ? <span className="truncate">{currentLabel}</span> : null}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent variant="admin" className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Choose Icon</DialogTitle>
            <DialogDescription>
              Pick an icon from the library, or add any Lucide icon by name.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder="Search icons"
                />
              </div>
              <Popover open={customIconOpen} onOpenChange={setCustomIconOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Add Lucide icon"
                    title="Add Lucide icon"
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <PopoverHeader>
                    <PopoverTitle>Add Lucide Icon</PopoverTitle>
                  </PopoverHeader>
                  <form className="space-y-3" onSubmit={handleCustomIconSubmit}>
                    <Input
                      autoFocus
                      value={customIconName}
                      onChange={(event) => setCustomIconName(event.target.value)}
                      placeholder="octagon-x"
                    />
                    {customIconError ? (
                      <p className="text-xs text-destructive">{customIconError}</p>
                    ) : customLucideIcon ? (
                      <p className="text-xs text-muted-foreground">
                        Found {getShellIconLabel(customLucideIcon)}.
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCustomIconOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={!customLucideIcon}>
                        Use Icon
                      </Button>
                    </div>
                  </form>
                </PopoverContent>
              </Popover>
            </div>

            <LucideIconGrid
              value={value}
              icons={filteredIcons}
              allowEmpty={allowEmpty}
              onSelect={(icon) => {
                onValueChange(icon)
                closePicker()
              }}
            />
          </DialogBody>

          <DialogFooter variant="plain">
            {allowEmpty && value ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onValueChange(undefined)
                  closePicker()
                }}
              >
                Remove Icon
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={closePicker}>
              Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LucideIconGrid({
  value,
  icons,
  allowEmpty,
  onSelect,
}: {
  value?: ShellIcon
  icons: { value: IconKey; label: string }[]
  allowEmpty: boolean
  onSelect: (icon: ShellIcon | undefined) => void
}) {
  if (!icons.length && !allowEmpty) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No icons match that search.</div>
  }

  return (
    <ScrollArea className="pr-2">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
        {allowEmpty ? (
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            className={cn(
              "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
              !value && "bg-primary/5"
            )}
            aria-label="Use no icon"
          >
            {!value ? <SelectedMark /> : null}
            <ImageIcon className="h-5 w-5" />
            <span className="line-clamp-2 text-[11px] leading-tight">None</span>
          </button>
        ) : null}
        {icons.map((option) => {
          const isSelected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
                isSelected && "bg-primary/5"
              )}
              aria-label={`Choose ${option.label} icon`}
            >
              {isSelected ? <SelectedMark /> : null}
              {renderShellIcon(option.value, "h-5 w-5")}
              <span className="line-clamp-2 text-[11px] leading-tight">{option.label}</span>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function SelectedMark() {
  return (
    <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
      <CheckIcon className="h-3 w-3" />
    </span>
  )
}
