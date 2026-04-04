"use client"

import { useMemo, useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, GripVertical, Link2, Plus, Search, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils/tailwind"
import {
  QUICK_LINK_ICON_OPTIONS,
  getQuickLinkIcon,
  getQuickLinkIconLabel,
  type QuickLinkIconName,
  type SiteQuickLink,
} from "@/lib/utils/site-quick-links"

interface QuickLinksSettingsCardProps {
  quickLinks: SiteQuickLink[]
  onQuickLinksChange: (quickLinks: SiteQuickLink[]) => void
}

interface SortableQuickLinkItemProps {
  link: SiteQuickLink
  onChange: (id: string, patch: Partial<SiteQuickLink>) => void
  onDelete: (id: string) => void
}

const ACTION_BUTTON_CLASS =
  "h-9 w-9 flex-shrink-0 rounded-md p-0 text-foreground hover:bg-muted/50"

function IconPickerButton({
  value,
  onChange,
}: {
  value?: QuickLinkIconName
  onChange: (value: QuickLinkIconName | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const SelectedIcon = getQuickLinkIcon(value)
  const DefaultIcon = getQuickLinkIcon()
  const selectedLabel = getQuickLinkIconLabel(value)
  const normalizedQuery = query.trim().toLowerCase()
  const showDefaultOption =
    !normalizedQuery || "default link".includes(normalizedQuery)

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return QUICK_LINK_ICON_OPTIONS

    return QUICK_LINK_ICON_OPTIONS.filter((option) => {
      const haystack = [
        option.label,
        option.value,
        ...(option.keywords || []),
      ].join(" ").toLowerCase()

      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery])

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={cn(ACTION_BUTTON_CLASS, value && "text-foreground")}
        aria-label={`Choose quick link icon (${selectedLabel})`}
        title={`Icon: ${selectedLabel}`}
      >
        <SelectedIcon className="h-4 w-4" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setQuery("")
        }}
      >
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Choose Icon</DialogTitle>
            <DialogDescription>
              Pick an icon for this quick link from the Lucide icon set.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-6 pb-6">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search icons"
              />
            </div>

            <div className="builder-scroll max-h-[420px] overflow-y-auto pr-2">
              {filteredOptions.length === 0 && !showDefaultOption ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No icons match that search.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
                  {showDefaultOption && (
                    <button
                      type="button"
                      onClick={() => {
                        onChange(undefined)
                        setOpen(false)
                        setQuery("")
                      }}
                      className={cn(
                        "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors",
                        !value
                          ? "bg-primary/5"
                          : "hover:bg-muted/50"
                      )}
                      aria-label="Use default icon"
                    >
                      {!value && (
                        <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <DefaultIcon className="h-5 w-5" />
                      <span className="line-clamp-2 text-[11px] leading-tight">
                        Default
                      </span>
                    </button>
                  )}
                  {filteredOptions.map((option) => {
                    const Icon = getQuickLinkIcon(option.value)
                    const isSelected = option.value === value

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value)
                          setOpen(false)
                          setQuery("")
                        }}
                        className={cn(
                          "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors",
                          isSelected
                            ? "bg-primary/5"
                            : "hover:bg-muted/50"
                        )}
                        aria-label={`Choose ${option.label} icon`}
                      >
                        {isSelected && (
                          <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                        <Icon className="h-5 w-5" />
                        <span className="line-clamp-2 text-[11px] leading-tight">
                          {option.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function UrlEditorButton({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draftValue, setDraftValue] = useState(value)

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) {
          setDraftValue(value)
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className={cn(ACTION_BUTTON_CLASS, value.trim() && "text-foreground")}
          aria-label={value.trim() ? "Edit quick link URL" : "Add quick link URL"}
          title={value.trim() || "Set quick link URL"}
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-3" align="end">
        <div className="flex items-center gap-2">
          <Input
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            placeholder="/settings or https://example.com"
            aria-label="Quick link URL"
          />
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={() => {
              onChange(draftValue.trim())
              setOpen(false)
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SortableQuickLinkItem({ link, onChange, onDelete }: SortableQuickLinkItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"
    >
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Reorder ${link.label || "quick link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Input
          value={link.label}
          onChange={(event) => onChange(link.id, { label: event.target.value })}
          className="h-9 w-20 border-0 px-3 text-sm shadow-none"
          placeholder="Label"
          aria-label="Quick link label"
        />
        <IconPickerButton
          value={link.icon}
          onChange={(icon) => onChange(link.id, { icon })}
        />
        <UrlEditorButton
          value={link.href}
          onChange={(href) => onChange(link.id, { href })}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(link.id)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${link.label || "quick link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function QuickLinksSettingsCard({
  quickLinks,
  onQuickLinksChange,
}: QuickLinksSettingsCardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleAddLink = () => {
    onQuickLinksChange([
      ...quickLinks,
      {
        id: crypto.randomUUID(),
        label: "",
        href: "",
      },
    ])
  }

  const handleUpdateLink = (id: string, patch: Partial<SiteQuickLink>) => {
    onQuickLinksChange(
      quickLinks.map((link) => (link.id === id ? { ...link, ...patch } : link))
    )
  }

  const handleDeleteLink = (id: string) => {
    onQuickLinksChange(quickLinks.filter((link) => link.id !== id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = quickLinks.findIndex((link) => link.id === active.id)
    const newIndex = quickLinks.findIndex((link) => link.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    onQuickLinksChange(arrayMove(quickLinks, oldIndex, newIndex))
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">Dashboard Quick Links</CardTitle>
          <CardDescription>
            These links show as tab-style pills in this site&apos;s dashboard header. Use{" "}<code>/settings</code>{" "}for
            internal links or{" "}<code>https://example.com</code>{" "}for external links.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddLink}
          className="h-8 w-8 p-0"
          aria-label="Add quick link"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {quickLinks.length === 0 ? (
          <div className="rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
            No quick links. Click + to add one.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={quickLinks.map((link) => link.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap gap-2">
                {quickLinks.map((link) => (
                  <SortableQuickLinkItem
                    key={link.id}
                    link={link}
                    onChange={handleUpdateLink}
                    onDelete={handleDeleteLink}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  )
}
