import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVertical, PlusIcon, Trash2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH,
  MAX_PUBLIC_NAVIGATION_HREF_LENGTH,
  MAX_PUBLIC_NAVIGATION_LABEL_LENGTH,
  MAX_PUBLIC_NAVIGATION_LINKS,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type PublicSiteSettingsProps = {
  navigation: PublicNavigationLink[]
  footer: PublicNavigationLink[]
  footerCopyright: string
  onNavigationChange: (links: PublicNavigationLink[]) => void
  onFooterChange: (links: PublicNavigationLink[]) => void
  onFooterCopyrightChange: (copyright: string) => void
  onSaveConfig: () => Promise<boolean>
}

const CHIP_CLASS =
  "w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"

export function PublicSiteSettings({
  navigation,
  footer,
  footerCopyright,
  onNavigationChange,
  onFooterChange,
  onFooterCopyrightChange,
  onSaveConfig,
}: PublicSiteSettingsProps) {
  return (
    <CardGroup>
      <PublicLinkEditor
        id="public-menu"
        title="Public menu"
        description="Links shown beside the site name on every public page. Leave this empty to keep the current simple page frame."
        links={navigation}
        onLinksChange={onNavigationChange}
        onSaveConfig={onSaveConfig}
      />
      <PublicLinkEditor
        id="public-footer"
        title="Public footer"
        description="Links shown at the bottom of every public page, in the order you put them."
        links={footer}
        onLinksChange={onFooterChange}
        onSaveConfig={onSaveConfig}
      />
      <CollapsibleSettingsCard
        storageId="public-footer-copyright"
        title="Copyright"
        description="One short copyright line shown beneath the footer links. Leave it empty to show nothing."
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor="public-footer-copyright-input">
            Copyright
          </FieldLabel>
          <Input
            id="public-footer-copyright-input"
            value={footerCopyright}
            maxLength={MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH}
            placeholder="© Your site name"
            onChange={(event) => onFooterCopyrightChange(event.target.value)}
          />
        </div>
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}

function PublicLinkEditor({
  id,
  title,
  description,
  links,
  onLinksChange,
  onSaveConfig,
}: {
  id: string
  title: string
  description: string
  links: PublicNavigationLink[]
  onLinksChange: (links: PublicNavigationLink[]) => void
  onSaveConfig: () => Promise<boolean>
}) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)
  const [pendingDeleteIndex, setPendingDeleteIndex] = React.useState<
    number | null
  >(null)
  const sensors = useNavSensors()
  const itemIds = links.map((_, index) => `${id}-${index}`)
  const linkNoun = title === "Public footer" ? "footer link" : "menu link"

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const oldIndex = itemIds.indexOf(String(event.active.id))
    const newIndex = itemIds.indexOf(String(event.over.id))
    if (oldIndex === -1 || newIndex === -1) return
    onLinksChange(arrayMove(links, oldIndex, newIndex))
  }

  const changeLink = (index: number, patch: Partial<PublicNavigationLink>) => {
    onLinksChange(
      links.map((link, at) => (at === index ? { ...link, ...patch } : link))
    )
  }

  const addLink = () => {
    const nextIndex = links.length
    onLinksChange([...links, { label: "", href: "" }])
    setOpenIndex(nextIndex)
  }

  const pendingDeleteLink =
    pendingDeleteIndex === null ? null : links[pendingDeleteIndex]

  return (
    <>
      <CollapsibleSettingsCard
        storageId={id}
        title={title}
        description={description}
      >
        <DndContext
          id={`custom-shell-${id}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={itemIds}
            strategy={horizontalListSortingStrategy}
          >
            <div className="flex flex-wrap items-center gap-2">
              {links.map((link, index) => (
                <PublicLinkChip
                  key={itemIds[index]}
                  id={itemIds[index]}
                  link={link}
                  linkNoun={linkNoun}
                  dialogOpen={openIndex === index}
                  onDialogOpenChange={(open) =>
                    setOpenIndex(open ? index : null)
                  }
                  onChange={(patch) => changeLink(index, patch)}
                  onDelete={() => setPendingDeleteIndex(index)}
                  onSaveConfig={onSaveConfig}
                />
              ))}
              <DisabledReason
                disabled={links.length >= MAX_PUBLIC_NAVIGATION_LINKS}
                reason={`A ${title.toLowerCase()} can have up to ${MAX_PUBLIC_NAVIGATION_LINKS} links.`}
              >
                <button
                  type="button"
                  disabled={links.length >= MAX_PUBLIC_NAVIGATION_LINKS}
                  onClick={addLink}
                  className="flex size-13 shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Add link to ${title.toLowerCase()}`}
                  title="Add link"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              </DisabledReason>
            </div>
          </SortableContext>
        </DndContext>
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={Boolean(pendingDeleteLink)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIndex(null)
        }}
        title="Delete this link?"
        description={describeLinkDelete(pendingDeleteLink, title)}
        confirmLabel="Delete link"
        onConfirm={() => {
          if (pendingDeleteIndex === null) return
          onLinksChange(
            links.filter((_, index) => index !== pendingDeleteIndex)
          )
          setPendingDeleteIndex(null)
        }}
      />
    </>
  )
}

function PublicLinkChip({
  id,
  link,
  linkNoun,
  dialogOpen,
  onDialogOpenChange,
  onChange,
  onDelete,
  onSaveConfig,
}: {
  id: string
  link: PublicNavigationLink
  linkNoun: string
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  onChange: (patch: Partial<PublicNavigationLink>) => void
  onDelete: () => void
  onSaveConfig: () => Promise<boolean>
}) {
  const labelInputRef = React.useRef<HTMLInputElement>(null)
  const [addressTouched, setAddressTouched] = React.useState(false)
  const label = link.label.trim()
  const itemName = label || linkNoun
  const addressProblem = getPublicAddressProblem(link.href, Boolean(label))
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)

  return (
    <div ref={setNodeRef} style={style} className={CHIP_CLASS}>
      <div className="flex max-w-full items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={DRAG_HANDLE_CLASS}
          aria-label={`Reorder ${itemName}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          className="max-w-56 justify-start px-3 text-sm font-medium"
          onClick={() => onDialogOpenChange(true)}
          aria-label={`Edit settings for ${itemName}`}
        >
          <span
            className={cn(
              "truncate",
              !label && "font-normal text-muted-foreground"
            )}
          >
            {label || "Name this link"}
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onDelete}
          aria-label={`Delete ${itemName}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogContent
          variant="admin"
          className="sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            if (label) return
            event.preventDefault()
            labelInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{label || linkNoun}</DialogTitle>
            <DialogDescription>
              Edit this public {linkNoun}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Destination</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`${id}-label`}>Label</FieldLabel>
                  <Input
                    ref={labelInputRef}
                    id={`${id}-label`}
                    value={link.label}
                    maxLength={MAX_PUBLIC_NAVIGATION_LABEL_LENGTH}
                    placeholder="About"
                    onChange={(event) =>
                      onChange({ label: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`${id}-href`}>Address</FieldLabel>
                  <Input
                    id={`${id}-href`}
                    value={link.href}
                    maxLength={MAX_PUBLIC_NAVIGATION_HREF_LENGTH}
                    placeholder="/about"
                    aria-invalid={
                      addressProblem && (link.href || addressTouched)
                        ? true
                        : undefined
                    }
                    onChange={(event) =>
                      onChange({ href: event.target.value })
                    }
                    onBlur={() => {
                      setAddressTouched(true)
                      if (addressProblem) showErrorToast(addressProblem)
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              onClick={() => {
                onDialogOpenChange(false)
                onDelete()
              }}
            >
              Delete link
            </Button>
            <Button
              type="button"
              onClick={async () => {
                await onSaveConfig()
                onDialogOpenChange(false)
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function getPublicAddressProblem(href: string, isNamed: boolean) {
  const address = href.trim()
  if (!address) {
    return isNamed ? "Give this link an address, like /about." : null
  }
  if (isSafeWrittenPageLink(address)) return null
  return "Use an internal address like /about or a safe full address like https://example.com."
}

function describeLinkDelete(
  link: PublicNavigationLink | null | undefined,
  title: string
) {
  const name = link?.label.trim()
    ? `“${link.label.trim()}”`
    : "This unnamed link"
  return `${name} will be removed from the ${title.toLowerCase()}. This cannot be undone.`
}
