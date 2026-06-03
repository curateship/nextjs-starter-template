"use client"

import { useCallback, useMemo, useState, type FormEvent } from "react"
import { Check, ImageIcon, Plus, Search } from "lucide-react"

import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils/tailwind"
import {
  QUICK_LINK_ICON_OPTIONS,
  getQuickLinkIcon,
  getQuickLinkIconLabel,
  normalizeDynamicLucideIconName,
  renderQuickLinkIcon,
  type QuickLinkIconValue
} from "@/lib/utils/site-quick-links"

export function ShellIconPreview({ icon, className }: { icon?: QuickLinkIconValue; className?: string }) {
  return renderQuickLinkIcon(icon, className)
}

function ShellIconSelectedMark() {
  return (
    <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
      <Check className="h-3 w-3" />
    </span>
  )
}

export function ShellIconPickerField({
  value,
  onChange,
  compact = false,
  allowEmpty = true
}: {
  value?: QuickLinkIconValue
  onChange: (value?: QuickLinkIconValue) => void
  compact?: boolean
  allowEmpty?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [customIconOpen, setCustomIconOpen] = useState(false)
  const [customIconName, setCustomIconName] = useState("")

  const DefaultIcon = getQuickLinkIcon()
  const normalizedQuery = query.trim().toLowerCase()
  const showDefaultOption = allowEmpty && (!normalizedQuery || "default icon".includes(normalizedQuery))
  const currentLabel = value ? getQuickLinkIconLabel(value) : "No icon"
  const customLucideIcon = normalizeDynamicLucideIconName(customIconName)
  const customIconError =
    customIconName.trim() && !customLucideIcon
      ? "No Lucide icon found with that name."
      : null

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return QUICK_LINK_ICON_OPTIONS

    return QUICK_LINK_ICON_OPTIONS.filter((option) => {
      const haystack = [option.label, option.value, ...(option.keywords || [])].join(" ").toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery])

  const resetPicker = useCallback(() => {
    setQuery("")
    setCustomIconOpen(false)
    setCustomIconName("")
  }, [])

  const closePicker = useCallback(() => {
    setOpen(false)
    resetPicker()
  }, [resetPicker])

  function handleCustomIconSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customLucideIcon) return
    onChange(customLucideIcon)
    closePicker()
  }

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon-sm" : "default"}
      className={cn(compact ? "h-8 w-8" : "h-9 w-9 shrink-0 p-0 shadow-none hover:bg-muted/50")}
      onClick={() => setOpen(true)}
      aria-label={`Choose icon, current icon ${currentLabel}`}
      title={currentLabel}
    >
      <ShellIconPreview icon={value} className="h-4 w-4 shrink-0" />
      {!value ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-md border border-dashed bg-muted text-muted-foreground",
            compact ? "h-7 w-7" : "h-9 w-9"
          )}
        >
          <ImageIcon className="h-4 w-4" />
        </span>
      ) : null}
    </Button>
  )

  return (
    <>
      {compact ? (
        trigger
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Icon</p>
          {trigger}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) {
            resetPicker()
          }
        }}
      >
        <DashboardModalContent
          className="max-h-none max-w-2xl overflow-visible"
          title="Choose Icon"
          bodyClassName="overflow-visible"
          viewportClassName="gap-4 pt-5"
          footer={
            <>
              {allowEmpty && value ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onChange(undefined)
                    closePicker()
                  }}
                >
                  Remove Icon
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={closePicker}>
                Back
              </Button>
            </>
          }
        >
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
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
                  className="shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="mb-3 text-sm font-medium">Add Lucide Icon</div>
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
                      Found {getQuickLinkIconLabel(customLucideIcon)}.
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

          <ScrollArea className="pr-2">
            {filteredOptions.length === 0 && !showDefaultOption ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No icons match that search.</div>
            ) : (
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                {showDefaultOption ? (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(undefined)
                      closePicker()
                    }}
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
                      !value && "bg-primary/5"
                    )}
                    aria-label="Use default icon"
                  >
                    {!value ? <ShellIconSelectedMark /> : null}
                    <DefaultIcon className="h-5 w-5" />
                    <span className="line-clamp-2 text-[11px] leading-tight">Default</span>
                  </button>
                ) : null}
                {filteredOptions.map((option) => {
                  const Icon = getQuickLinkIcon(option.value)
                  const isSelected = option.value === value

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value)
                        closePicker()
                      }}
                      className={cn(
                        "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
                        isSelected && "bg-primary/5"
                      )}
                      aria-label={`Choose ${option.label} icon`}
                    >
                      {isSelected ? <ShellIconSelectedMark /> : null}
                      <Icon className="h-5 w-5" />
                      <span className="line-clamp-2 text-[11px] leading-tight">{option.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </ScrollArea>
        </DashboardModalContent>
      </Dialog>
    </>
  )
}
