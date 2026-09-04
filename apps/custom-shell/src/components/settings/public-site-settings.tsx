import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVertical, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  PUBLIC_HEADER_LOGO_SIZES,
  PUBLIC_HEADER_MENU_ALIGNMENTS,
  type PublicHeader,
  type PublicHeaderLogoSize,
  type PublicHeaderMenuAlignment,
} from "@/lib/pages/public-header"
import {
  MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH,
  MAX_PUBLIC_NAVIGATION_HREF_LENGTH,
  MAX_PUBLIC_NAVIGATION_LABEL_LENGTH,
  MAX_PUBLIC_NAVIGATION_LINKS,
  isPublicNavigationLink,
  isPublicNavigationSearchItem,
  type PublicNavigationItem,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type PublicSiteSettingsProps = {
  navigation: PublicNavigationItem[]
  footer: PublicNavigationLink[]
  footerCopyright: string
  publicHeader: PublicHeader
  onNavigationChange: (items: PublicNavigationItem[]) => void
  onFooterChange: (links: PublicNavigationLink[]) => void
  onFooterCopyrightChange: (copyright: string) => void
  onPublicHeaderChange: (header: PublicHeader) => void
  onSaveConfig: () => Promise<boolean>
}

const CHIP_CLASS =
  "w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50"

export function PublicSiteSettings({
  navigation,
  footer,
  footerCopyright,
  publicHeader,
  onNavigationChange,
  onFooterChange,
  onFooterCopyrightChange,
  onPublicHeaderChange,
  onSaveConfig,
}: PublicSiteSettingsProps) {
  return (
    <CardGroup>
      <PublicLinkEditor
        id="public-menu"
        title="Public menu"
        description="Drag search and links into the order they should appear beside the site name."
        links={navigation}
        onLinksChange={onNavigationChange}
        onSaveConfig={onSaveConfig}
      />
      <PublicHeaderSettings
        header={publicHeader}
        onChange={onPublicHeaderChange}
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

function PublicHeaderSettings({
  header,
  onChange,
}: {
  header: PublicHeader
  onChange: (header: PublicHeader) => void
}) {
  const update = (patch: Partial<PublicHeader>) =>
    onChange({ ...header, ...patch })

  return (
    <CollapsibleSettingsCard
      storageId="public-header-layout"
      title="Header layout"
      description="Choose how the full public header behaves on every public page."
      contentClassName="grid gap-4"
    >
      <div className="flex items-center justify-between gap-4">
        <FieldLabel
          htmlFor="public-header-sticky"
          hint="Keeps the header at the top while a visitor scrolls."
        >
          Sticky header
        </FieldLabel>
        <Switch
          id="public-header-sticky"
          checked={header.sticky}
          onCheckedChange={(sticky) => update({ sticky })}
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="public-header-menu-alignment"
          hint="Centre places the desktop menu in the middle of the page. Phone navigation stays in its menu button."
        >
          Menu position
        </FieldLabel>
        <Select
          value={header.menuAlignment}
          onValueChange={(menuAlignment) =>
            update({
              menuAlignment: menuAlignment as PublicHeaderMenuAlignment,
            })
          }
        >
          <SelectTrigger
            id="public-header-menu-alignment"
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PUBLIC_HEADER_MENU_ALIGNMENTS.map((alignment) => (
              <SelectItem key={alignment} value={alignment}>
                {alignment === "center" ? "Centre" : "Left"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="public-header-logo-size"
          hint="Sets the logo height to 32, 48, or 64 pixels."
        >
          Logo size
        </FieldLabel>
        <Select
          value={header.logoSize}
          onValueChange={(logoSize) =>
            update({ logoSize: logoSize as PublicHeaderLogoSize })
          }
        >
          <SelectTrigger
            id="public-header-logo-size"
            className="w-full sm:w-fit"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PUBLIC_HEADER_LOGO_SIZES.map((size) => (
              <SelectItem key={size} value={size}>
                {size === "small"
                  ? "Small"
                  : size === "large"
                    ? "Large"
                    : "Standard"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </CollapsibleSettingsCard>
  )
}

function PublicLinkEditor<T extends PublicNavigationItem>({
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
  links: T[]
  onLinksChange: (links: T[]) => void
  onSaveConfig: () => Promise<boolean>
}) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)
  const [pendingDeleteIndex, setPendingDeleteIndex] = React.useState<
    number | null
  >(null)
  const sensors = useNavSensors()
  const itemIds = links.map((item, index) =>
    isPublicNavigationSearchItem(item) ? `${id}-search` : `${id}-${index}`
  )
  const linkNoun = title === "Public footer" ? "footer link" : "menu link"
  const linkCount = links.filter(isPublicNavigationLink).length

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const oldIndex = itemIds.indexOf(String(event.active.id))
    const newIndex = itemIds.indexOf(String(event.over.id))
    if (oldIndex === -1 || newIndex === -1) return
    onLinksChange(arrayMove(links, oldIndex, newIndex))
  }

  const changeLink = (index: number, patch: Partial<PublicNavigationLink>) => {
    onLinksChange(
      links.map((item, at) =>
        at === index && isPublicNavigationLink(item)
          ? { ...item, ...patch }
          : item
      ) as T[]
    )
  }

  const changeSearchVisibility = (index: number, visible: boolean) => {
    onLinksChange(
      links.map((item, at) =>
        at === index && isPublicNavigationSearchItem(item)
          ? { ...item, visible }
          : item
      ) as T[]
    )
  }

  const addLink = () => {
    const nextIndex = links.length
    onLinksChange([...links, { label: "", href: "" } as T])
    setOpenIndex(nextIndex)
  }

  const pendingDeleteItem =
    pendingDeleteIndex === null ? null : links[pendingDeleteIndex]
  const pendingDeleteLink =
    pendingDeleteItem && isPublicNavigationLink(pendingDeleteItem)
      ? pendingDeleteItem
      : null

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
              {links.map((item, index) =>
                isPublicNavigationSearchItem(item) ? (
                  <PublicSearchChip
                    key={itemIds[index]}
                    id={itemIds[index]}
                    visible={item.visible}
                    onVisibleChange={(visible) =>
                      changeSearchVisibility(index, visible)
                    }
                  />
                ) : (
                  <PublicLinkChip
                    key={itemIds[index]}
                    id={itemIds[index]}
                    link={item}
                    linkNoun={linkNoun}
                    dialogOpen={openIndex === index}
                    onDialogOpenChange={(open) =>
                      setOpenIndex(open ? index : null)
                    }
                    onChange={(patch) => changeLink(index, patch)}
                    onDelete={() => setPendingDeleteIndex(index)}
                    onSaveConfig={onSaveConfig}
                  />
                )
              )}
              <DisabledReason
                disabled={linkCount >= MAX_PUBLIC_NAVIGATION_LINKS}
                reason={`A ${title.toLowerCase()} can have up to ${MAX_PUBLIC_NAVIGATION_LINKS} links.`}
              >
                <button
                  type="button"
                  disabled={linkCount >= MAX_PUBLIC_NAVIGATION_LINKS}
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

function PublicSearchChip({
  id,
  visible,
  onVisibleChange,
}: {
  id: string
  visible: boolean
  onVisibleChange: (visible: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)

  return (
    <div ref={setNodeRef} style={style} className={CHIP_CLASS}>
      <div className="flex max-w-full items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={DRAG_HANDLE_CLASS}
          aria-label="Reorder Search"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex h-8 max-w-56 items-center gap-2 px-3 text-sm font-medium">
          <SearchIcon className="h-4 w-4 shrink-0" />
          Search
          {!visible ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Hidden
            </span>
          ) : null}
        </span>
        <label
          className="flex size-8 shrink-0 items-center justify-center rounded-md"
          title={visible ? "Visible" : "Hidden"}
        >
          <Checkbox
            checked={visible}
            onCheckedChange={(checked) => onVisibleChange(checked === true)}
          />
          <span className="sr-only">Show Search</span>
        </label>
      </div>
    </div>
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
