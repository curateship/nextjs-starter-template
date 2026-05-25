"use client"

import { useState } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { ShellIconPickerField, ShellIconPreview } from "@/components/admin/layout/settings/ShellIconPicker"
import { Card, CardContent, CardDescription, CardGroup, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog } from "@/components/ui/dialog"
import { cn } from "@/lib/utils/tailwind"
import { type QuickLinkIconValue, type SiteQuickLink } from "@/lib/utils/site-quick-links"

interface QuickLinksSettingsCardProps {
  quickLinks: SiteQuickLink[]
  siteId: string
  onQuickLinksChange: (quickLinks: SiteQuickLink[]) => void
}

interface SortableQuickLinkItemProps {
  link: SiteQuickLink
  siteId: string
  onChange: (id: string, patch: Partial<SiteQuickLink>) => void
  onDelete: (id: string) => void
}

const ACTION_BUTTON_CLASS = "h-9 w-9 shrink-0 rounded-md p-0 text-foreground hover:bg-muted/50"

function QuickLinkSettingsButton({
  label,
  value,
  href,
  siteId,
  onSave
}: {
  label: string
  value?: QuickLinkIconValue
  href: string
  siteId: string
  onSave: (patch: Pick<SiteQuickLink, "label" | "href" | "icon">) => void
}) {
  const [open, setOpen] = useState(false)
  const [draftLabel, setDraftLabel] = useState(label)
  const [draftHref, setDraftHref] = useState(href)
  const [draftIcon, setDraftIcon] = useState<QuickLinkIconValue | undefined>(value)

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setOpen(true)}
          className="h-9 max-w-[180px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${label || "quick link"}`}
          title={label || "Quick link settings"}
        >
          <ShellIconPreview icon={value} className="h-4 w-4 shrink-0" />
          <span className="truncate">{label || "Quick link"}</span>
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (nextOpen) {
            setDraftLabel(label)
            setDraftHref(href)
            setDraftIcon(value)
          }
        }}
      >
        <DashboardModalContent
          title="Quick Link Settings"
          description="Update the name, destination URL, and dashboard icon for this quick link."
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="outline" onClick={() => setDraftIcon(undefined)}>
                Remove Icon
              </Button>
              <Button
                type="button"
                onClick={() => {
                  onSave({
                    label: draftLabel,
                    href: draftHref.trim(),
                    icon: draftIcon
                  })
                  setOpen(false)
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Quick link</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-[auto_minmax(0,180px)_minmax(0,1fr)] md:items-end">
                  <ShellIconPickerField siteId={siteId} value={draftIcon} onChange={setDraftIcon} />
                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      value={draftLabel}
                      onChange={(event) => setDraftLabel(event.target.value)}
                      placeholder="Label"
                      aria-label="Quick link name"
                    />
                  </Field>
                  <Field>
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      value={draftHref}
                      onChange={(event) => setDraftHref(event.target.value)}
                      placeholder="/settings or https://example.com"
                      aria-label="Quick link URL"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </Dialog>
    </>
  )
}

function SortableQuickLinkItem({ link, siteId, onChange, onDelete }: SortableQuickLinkItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
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
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Reorder ${link.label || "quick link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <QuickLinkSettingsButton
          label={link.label}
          value={link.icon}
          href={link.href}
          siteId={siteId}
          onSave={(patch) => onChange(link.id, patch)}
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

export function QuickLinksSettingsCard({ quickLinks, siteId, onQuickLinksChange }: QuickLinksSettingsCardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleAddLink = () => {
    onQuickLinksChange([
      ...quickLinks,
      {
        id: crypto.randomUUID(),
        label: "",
        href: ""
      }
    ])
  }

  const handleUpdateLink = (id: string, patch: Partial<SiteQuickLink>) => {
    onQuickLinksChange(quickLinks.map((link) => (link.id === id ? { ...link, ...patch } : link)))
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-base">Dashboard Quick Links</CardTitle>
          <CardDescription>
            These links show as tab-style pills in this site&apos;s dashboard header. Use <code>/settings</code> for
            internal links or <code>https://example.com</code> for external links.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {quickLinks.length === 0 ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
              No quick links.
            </div>
            <button
              type="button"
              onClick={handleAddLink}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
              aria-label="Add quick link"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={quickLinks.map((link) => link.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex flex-wrap items-center gap-2">
                {quickLinks.map((link) => (
                  <SortableQuickLinkItem
                    key={link.id}
                    link={link}
                    siteId={siteId}
                    onChange={handleUpdateLink}
                    onDelete={handleDeleteLink}
                  />
                ))}
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                  aria-label="Add quick link"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  )
}
