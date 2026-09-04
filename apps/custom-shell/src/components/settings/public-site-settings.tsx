import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ChevronDownIcon,
  GripVertical,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  DRAG_HANDLE_CLASS,
  createShellId,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { InlineError } from "@/components/ui/inline-error"
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
  MAX_PUBLIC_FOOTER_LINKS,
  MAX_PUBLIC_NAVIGATION_HREF_LENGTH,
  MAX_PUBLIC_NAVIGATION_LABEL_LENGTH,
  isPublicNavigationGroup,
  isPublicNavigationLink,
  isPublicNavigationSearchItem,
  type PublicNavigationGroup,
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
        description="Drag search, links, and dropdown groups into the order they should appear beside the site name."
        links={navigation}
        onLinksChange={onNavigationChange}
        onSaveConfig={onSaveConfig}
        allowGroups
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
  allowGroups = false,
}: {
  id: string
  title: string
  description: string
  links: T[]
  onLinksChange: (links: T[]) => void
  onSaveConfig: () => Promise<boolean>
  allowGroups?: boolean
}) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)
  const [creatingGroup, setCreatingGroup] = React.useState(false)
  const [pendingDeleteIndex, setPendingDeleteIndex] = React.useState<
    number | null
  >(null)
  const sensors = useNavSensors()
  const itemIds = links.map((item, index) => {
    if (isPublicNavigationSearchItem(item)) return `${id}-search`
    return isPublicNavigationGroup(item)
      ? `${id}-group-${index}`
      : `${id}-link-${index}`
  })
  const linkNoun = title === "Public footer" ? "footer link" : "menu link"
  const footerAtLimit =
    !allowGroups &&
    links.filter(isPublicNavigationLink).length >= MAX_PUBLIC_FOOTER_LINKS

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

  const changeGroup = (index: number, group: PublicNavigationGroup) => {
    onLinksChange(
      links.map((item, at) =>
        at === index && isPublicNavigationGroup(item) ? group : item
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
  const pendingDeleteEntry =
    pendingDeleteItem &&
    (isPublicNavigationLink(pendingDeleteItem) ||
      isPublicNavigationGroup(pendingDeleteItem))
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
                ) : isPublicNavigationGroup(item) ? (
                  <PublicGroupChip
                    key={itemIds[index]}
                    id={itemIds[index]}
                    group={item}
                    dialogOpen={openIndex === index}
                    onDialogOpenChange={(open) =>
                      setOpenIndex(open ? index : null)
                    }
                    onChange={(group) => changeGroup(index, group)}
                    onDelete={() => setPendingDeleteIndex(index)}
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
              {allowGroups ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex size-13 shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                      aria-label="Add item to public menu"
                      title="Add menu item"
                    >
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-44">
                    <DropdownMenuItem onSelect={addLink}>
                      Add link
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setCreatingGroup(true)}>
                      Add dropdown group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <DisabledReason
                  disabled={footerAtLimit}
                  reason={`A ${title.toLowerCase()} can have up to ${MAX_PUBLIC_FOOTER_LINKS} links.`}
                >
                  <button
                    type="button"
                    disabled={footerAtLimit}
                    onClick={addLink}
                    className="flex size-13 shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Add link to ${title.toLowerCase()}`}
                    title="Add link"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </DisabledReason>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </CollapsibleSettingsCard>

      <ConfirmDialog
        open={Boolean(pendingDeleteEntry)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteIndex(null)
        }}
        title={
          pendingDeleteEntry && isPublicNavigationGroup(pendingDeleteEntry)
            ? "Delete this dropdown group?"
            : "Delete this link?"
        }
        description={describeItemDelete(pendingDeleteEntry, title)}
        confirmLabel={
          pendingDeleteEntry && isPublicNavigationGroup(pendingDeleteEntry)
            ? "Delete group"
            : "Delete link"
        }
        onConfirm={() => {
          if (pendingDeleteIndex === null) return
          onLinksChange(
            links.filter((_, index) => index !== pendingDeleteIndex)
          )
          setPendingDeleteIndex(null)
        }}
      />

      {creatingGroup ? (
        <PublicGroupDialog
          onClose={() => setCreatingGroup(false)}
          onSave={(group) => {
            onLinksChange([...links, group] as T[])
            setCreatingGroup(false)
          }}
        />
      ) : null}
    </>
  )
}

type PublicGroupDraftLink = PublicNavigationLink & { id: string }

type PublicGroupDraft = {
  label: string
  links: PublicGroupDraftLink[]
}

function PublicGroupChip({
  id,
  group,
  dialogOpen,
  onDialogOpenChange,
  onChange,
  onDelete,
}: {
  id: string
  group: PublicNavigationGroup
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  onChange: (group: PublicNavigationGroup) => void
  onDelete: () => void
}) {
  const label = group.label.trim()
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)

  return (
    <div ref={setNodeRef} style={style} className={CHIP_CLASS}>
      <div className="flex max-w-full items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className={DRAG_HANDLE_CLASS}
          aria-label={`Reorder ${label || "dropdown group"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          className="max-w-56 justify-start gap-2 px-3 text-sm font-medium"
          onClick={() => onDialogOpenChange(true)}
          aria-label={`Edit settings for ${label || "dropdown group"}`}
        >
          <span
            className={cn(
              "truncate",
              !label && "font-normal text-muted-foreground"
            )}
          >
            {label || "Name this group"}
          </span>
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {group.links.length} {group.links.length === 1 ? "link" : "links"}
          </span>
          <ChevronDownIcon className="h-4 w-4 shrink-0" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={onDelete}
          aria-label={`Delete ${label || "dropdown group"}`}
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      {dialogOpen ? (
        <PublicGroupDialog
          group={group}
          onClose={() => onDialogOpenChange(false)}
          onSave={(nextGroup) => {
            onChange(nextGroup)
            onDialogOpenChange(false)
          }}
          onDelete={() => {
            onDialogOpenChange(false)
            onDelete()
          }}
        />
      ) : null}
    </div>
  )
}

function PublicGroupDialog({
  group,
  onClose,
  onSave,
  onDelete,
}: {
  group?: PublicNavigationGroup
  onClose: () => void
  onSave: (group: PublicNavigationGroup) => void
  onDelete?: () => void
}) {
  const [draft, setDraft] = React.useState<PublicGroupDraft>(() =>
    createPublicGroupDraft(group)
  )
  const [attempted, setAttempted] = React.useState(false)
  const nameRef = React.useRef<HTMLInputElement>(null)
  const nameErrorId = React.useId()
  const sensors = useNavSensors()
  const linkIds = draft.links.map((link) => link.id)
  const dirty = publicGroupDraftIsDirty(draft, group)
  const nameInvalid = attempted && !draft.label.trim()

  const changeLink = (
    id: string,
    patch: Partial<Pick<PublicGroupDraftLink, "label" | "href">>
  ) => {
    setDraft((current) => ({
      ...current,
      links: current.links.map((link) =>
        link.id === id ? { ...link, ...patch } : link
      ),
    }))
  }

  const save = () => {
    setAttempted(true)
    if (!draft.label.trim()) {
      nameRef.current?.focus()
      return
    }
    if (!draft.links.length) {
      showErrorToast("Add at least one link to this dropdown group.")
      return
    }

    const incomplete = draft.links.find(
      (link) =>
        !link.label.trim() ||
        Boolean(getPublicAddressProblem(link.href, true))
    )
    if (incomplete) {
      showErrorToast(
        !incomplete.label.trim()
          ? "Give every link in this group a label."
          : getPublicAddressProblem(incomplete.href, true) ||
              "Finish every link in this group."
      )
      return
    }

    onSave({
      type: "group",
      label: draft.label.trim(),
      links: draft.links.map(({ label, href }) => ({
        label: label.trim(),
        href: href.trim(),
      })),
    })
  }

  return (
    <FormDialog open dirty={dirty} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-2xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            nameRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {group ? group.label : "New dropdown group"}
            </DialogTitle>
            <DialogDescription>
              Name the dropdown and put its links in the order visitors should
              see them.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Group name</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <FieldLabel htmlFor="public-menu-group-name">Name</FieldLabel>
                <Input
                  ref={nameRef}
                  id="public-menu-group-name"
                  value={draft.label}
                  maxLength={MAX_PUBLIC_NAVIGATION_LABEL_LENGTH}
                  placeholder="Resources"
                  aria-invalid={nameInvalid || undefined}
                  aria-describedby={nameInvalid ? nameErrorId : undefined}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
                {nameInvalid ? (
                  <InlineError id={nameErrorId} className="text-xs">
                    Name is required.
                  </InlineError>
                ) : null}
              </CardContent>
            </Card>

            <Card size="sm">
              <CardHeader>
                <CardTitle>Links</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6">
                {draft.links.length ? (
                  <DndContext
                    id="custom-shell-public-menu-group-links"
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                      if (!event.over || event.active.id === event.over.id) {
                        return
                      }
                      const oldIndex = linkIds.indexOf(String(event.active.id))
                      const newIndex = linkIds.indexOf(String(event.over.id))
                      if (oldIndex === -1 || newIndex === -1) return
                      setDraft((current) => ({
                        ...current,
                        links: arrayMove(current.links, oldIndex, newIndex),
                      }))
                    }}
                  >
                    <SortableContext
                      items={linkIds}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid gap-6">
                        {draft.links.map((link, index) => (
                          <PublicGroupLinkFields
                            key={link.id}
                            link={link}
                            index={index}
                            attempted={attempted}
                            onChange={(patch) => changeLink(link.id, patch)}
                            onDelete={() =>
                              setDraft((current) => ({
                                ...current,
                                links: current.links.filter(
                                  (item) => item.id !== link.id
                                ),
                              }))
                            }
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This group has no links yet.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      links: [
                        ...current.links,
                        createPublicGroupDraftLink(),
                      ],
                    }))
                  }
                >
                  <PlusIcon />
                  Add link
                </Button>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            {onDelete ? (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                onClick={onDelete}
              >
                Delete group
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              {group ? "Save changes" : "Create group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function PublicGroupLinkFields({
  link,
  index,
  attempted,
  onChange,
  onDelete,
}: {
  link: PublicGroupDraftLink
  index: number
  attempted: boolean
  onChange: (
    patch: Partial<Pick<PublicGroupDraftLink, "label" | "href">>
  ) => void
  onDelete: () => void
}) {
  const [labelTouched, setLabelTouched] = React.useState(false)
  const [addressTouched, setAddressTouched] = React.useState(false)
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    link.id,
    true
  )
  const named = Boolean(link.label.trim())
  const addressProblem = getPublicAddressProblem(link.href, true)
  const labelId = `${link.id}-label`
  const addressId = `${link.id}-href`

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(DRAG_HANDLE_CLASS, "mt-6 shrink-0")}
        aria-label={`Reorder group link ${index + 1}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <FieldLabel htmlFor={labelId}>Label</FieldLabel>
          <Input
            id={labelId}
            value={link.label}
            maxLength={MAX_PUBLIC_NAVIGATION_LABEL_LENGTH}
            placeholder="Guides"
            aria-invalid={
              (attempted || labelTouched) && !named ? true : undefined
            }
            onChange={(event) => onChange({ label: event.target.value })}
            onBlur={() => {
              setLabelTouched(true)
              if (!named) showErrorToast("Give this link a label.")
            }}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel htmlFor={addressId}>Address</FieldLabel>
          <Input
            id={addressId}
            value={link.href}
            maxLength={MAX_PUBLIC_NAVIGATION_HREF_LENGTH}
            placeholder="/guides"
            aria-invalid={
              (attempted || addressTouched) && addressProblem ? true : undefined
            }
            onChange={(event) => onChange({ href: event.target.value })}
            onBlur={() => {
              setAddressTouched(true)
              if (addressProblem) showErrorToast(addressProblem)
            }}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-6 shrink-0"
        onClick={onDelete}
        aria-label={`Delete group link ${index + 1}`}
      >
        <Trash2Icon className="h-4 w-4" />
      </Button>
    </div>
  )
}

function createPublicGroupDraft(
  group?: PublicNavigationGroup
): PublicGroupDraft {
  return {
    label: group?.label ?? "",
    links: group
      ? group.links.map((link) => createPublicGroupDraftLink(link))
      : [createPublicGroupDraftLink()],
  }
}

function createPublicGroupDraftLink(
  link: PublicNavigationLink = { label: "", href: "" }
): PublicGroupDraftLink {
  return { ...link, id: createShellId("public-group-link") }
}

function publicGroupDraftIsDirty(
  draft: PublicGroupDraft,
  group?: PublicNavigationGroup
) {
  if (!group) {
    return Boolean(
      draft.label || draft.links.some((link) => link.label || link.href)
    )
  }

  return (
    draft.label !== group.label ||
    draft.links.length !== group.links.length ||
    draft.links.some(
      (link, index) =>
        link.label !== group.links[index]?.label ||
        link.href !== group.links[index]?.href
    )
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

function describeItemDelete(
  item: PublicNavigationLink | PublicNavigationGroup | null | undefined,
  title: string
) {
  const name = item?.label.trim()
    ? `“${item.label.trim()}”`
    : "This unnamed item"
  if (item && isPublicNavigationGroup(item)) {
    const linkNoun = item.links.length === 1 ? "link" : "links"
    return `${name} and its ${item.links.length} ${linkNoun} will be removed from the public menu. This cannot be undone.`
  }
  return `${name} will be removed from the ${title.toLowerCase()}. This cannot be undone.`
}
