import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ChevronDownIcon,
  GripVertical,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { PublicHeaderActionsEditor } from "@/components/settings/public-header-actions-editor"
import { PublicSocialEditor } from "@/components/settings/public-social-editor"
import {
  ChoiceTiles,
  LogoMark,
  MenuDashes,
  SettingsRow,
  SettingsRowsCard,
  SettingsTile,
  SwitchTile,
  TextLines,
} from "@/components/settings/settings-rows"
import { PublicUserPanelDialog } from "@/components/settings/public-user-panel-settings"
import { SettingsSelectRow } from "@/components/settings/settings-select-row"
import {
  createShellId,
  DRAG_GRIP_CLASS,
  DRAG_HANDLE_CLASS,
  reorderByDrag,
  stableItemIds,
  useNavSensors,
  useSortableChip,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import {
  EditPopoverBody,
  EditPopoverFooter,
  EditPopoverHeader,
  FormPopover,
} from "@/components/ui/edit-popover"
import {
  normalizePublicDevice,
  PUBLIC_DEVICE_HINTS,
  PUBLIC_DEVICE_LABELS,
  PUBLIC_DEVICES,
  type PublicDevice,
} from "@/lib/pages/public-device"
import { InlineError } from "@/components/ui/inline-error"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NumberField } from "@/components/ui/number-field"
import {
  PUBLIC_BREADCRUMB_HINTS,
  PUBLIC_BREADCRUMB_KINDS,
  PUBLIC_BREADCRUMB_LABELS,
  type PublicBreadcrumbs,
} from "@/lib/pages/public-breadcrumbs"
import {
  DEFAULT_PUBLIC_HEADER_MENU_FONT_SIZE,
  MAX_PUBLIC_HEADER_LOGO_GAP,
  MAX_PUBLIC_HEADER_MENU_FONT_SIZE,
  MAX_PUBLIC_HEADER_WIDTH,
  MIN_PUBLIC_HEADER_LOGO_GAP,
  MIN_PUBLIC_HEADER_MENU_FONT_SIZE,
  MIN_PUBLIC_HEADER_WIDTH,
  PUBLIC_HEADER_BLUR_LABELS,
  PUBLIC_HEADER_BLURS,
  PUBLIC_HEADER_LOGO_SIZES,
  PUBLIC_HEADER_MENU_ALIGNMENTS,
  type PublicHeader,
} from "@/lib/pages/public-header"
import {
  MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH,
  MAX_PUBLIC_FOOTER_LINKS,
  MAX_PUBLIC_NAVIGATION_HREF_LENGTH,
  MAX_PUBLIC_NAVIGATION_LABEL_LENGTH,
  isPublicNavigationGroup,
  isPublicNavigationLink,
  type PublicNavigationGroup,
  type PublicNavigationItem,
  type PublicNavigationLink,
} from "@/lib/pages/public-navigation"
import type { PublicSocialLink } from "@/lib/pages/public-social"
import type { PublicHeaderAction } from "@/lib/pages/public-header-actions"
import {
  PUBLIC_FOOTER_ALIGNMENT_HINTS,
  PUBLIC_FOOTER_ALIGNMENT_LABELS,
  PUBLIC_FOOTER_ALIGNMENTS,
  PUBLIC_THEME_CHROME_FONTS,
  PUBLIC_THEME_HEADING_FONT_LABELS,
  type PublicFooterAlignment,
  type PublicThemeChromeFont,
} from "@/lib/public-theme"
import type { PublicUserPanel } from "@/lib/pages/public-user-panel"
import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"
import { showErrorToast } from "@/lib/toast/error-toast"
import { ADD_CHIP_CLASS } from "@/components/settings/top-right-settings"
import { cn } from "@/lib/utils"

type PublicSiteSettingsProps = {
  navigation: PublicNavigationItem[]
  footer: PublicNavigationLink[]
  footerSocial: PublicSocialLink[]
  footerCopyright: string
  /** Where the public footer sits, or `inherit` to follow the page. */
  footerAlignment: PublicFooterAlignment
  publicHeader: PublicHeader
  /** Styling's page width, which the header follows until it has its own. */
  pageWidth: number
  /** Styling's face for the header and footer, set from this card. */
  chromeFont: PublicThemeChromeFont
  headerActions: PublicHeaderAction[]
  publicUserPanel: PublicUserPanel
  publicBreadcrumbs: PublicBreadcrumbs
  onNavigationChange: (items: PublicNavigationItem[]) => void
  onFooterChange: (links: PublicNavigationLink[]) => void
  onFooterSocialChange: (links: PublicSocialLink[]) => void
  onFooterCopyrightChange: (copyright: string) => void
  onFooterAlignmentChange: (alignment: PublicFooterAlignment) => void
  onPublicHeaderChange: (header: PublicHeader) => void
  onChromeFontChange: (font: PublicThemeChromeFont) => void
  onHeaderActionsChange: (actions: PublicHeaderAction[]) => void
  onPublicUserPanelChange: (panel: PublicUserPanel) => void
  onPublicBreadcrumbsChange: (breadcrumbs: PublicBreadcrumbs) => void
  onSaveConfig: () => Promise<boolean>
}

const CHIP_CLASS =
  "w-fit max-w-full rounded-xl border border-zinc-200/40 bg-background py-1.5 pr-1.5 pl-1 transition-colors hover:border-zinc-300/40 dark:border-zinc-700/40"

export function PublicSiteSettings({
  navigation,
  footer,
  footerSocial,
  footerCopyright,
  footerAlignment,
  publicHeader,
  pageWidth,
  chromeFont,
  headerActions,
  publicUserPanel,
  publicBreadcrumbs,
  onNavigationChange,
  onFooterChange,
  onFooterSocialChange,
  onFooterCopyrightChange,
  onFooterAlignmentChange,
  onPublicHeaderChange,
  onChromeFontChange,
  onHeaderActionsChange,
  onPublicUserPanelChange,
  onPublicBreadcrumbsChange,
  onSaveConfig,
}: PublicSiteSettingsProps) {
  const [editingUserPanel, setEditingUserPanel] = React.useState(false)

  return (
    // Three cards of rows, one per part of a public page: the header, the
    // trail under it, and the footer (Tyler, 9 Nov 2026: "redesign the
    // public page", with a drawing; `settings-rows.tsx` holds the pieces).
    <CardGroup>
      <SettingsRowsCard>
        <PublicHeaderRows
          header={publicHeader}
          pageWidth={pageWidth}
          chromeFont={chromeFont}
          onChange={onPublicHeaderChange}
          onChromeFontChange={onChromeFontChange}
        />
        <PublicLinkEditor
          id="public-menu"
          title="Public menu"
          description="Drag links and dropdown groups into the order they should appear beside the site name."
          links={navigation}
          onLinksChange={onNavigationChange}
          onSaveConfig={onSaveConfig}
          allowGroups
        />
        <SettingsRow
          title="Action items"
          description="The controls at the right-hand end of the header. Drag them into the order they should appear, and switch one off to leave it out. The account corner opens its own settings."
        >
          <PublicHeaderActionsEditor
            actions={headerActions}
            onActionsChange={onHeaderActionsChange}
            onEditUserPanel={() => setEditingUserPanel(true)}
          />
        </SettingsRow>
      </SettingsRowsCard>

      <SettingsRowsCard>
        <PublicBreadcrumbSettings
          breadcrumbs={publicBreadcrumbs}
          onChange={onPublicBreadcrumbsChange}
        />
      </SettingsRowsCard>

      <SettingsRowsCard>
        <PublicLinkEditor
          id="public-footer"
          title="Public footer"
          description="Links shown at the bottom of every public page, in the order you put them."
          links={footer}
          onLinksChange={onFooterChange}
          onSaveConfig={onSaveConfig}
        />
        <SettingsRow
          title="Footer alignment"
          description="Where the logo, the description, the social buttons, the links and the copyright line sit."
        >
          <ChoiceTiles
            id="public-footer-alignment"
            label="Alignment"
            hint={PUBLIC_FOOTER_ALIGNMENT_HINTS[footerAlignment]}
            value={footerAlignment}
            onChange={onFooterAlignmentChange}
            options={PUBLIC_FOOTER_ALIGNMENTS.map((alignment) => ({
              value: alignment,
              label: PUBLIC_FOOTER_ALIGNMENT_LABELS[alignment],
              drawing: (
                <TextLines
                  align={alignment === "center" ? "center" : "left"}
                  faint={alignment === "inherit"}
                />
              ),
            }))}
          />
        </SettingsRow>
        <SettingsRow
          title="Social accounts"
          description="Drawn as buttons under the site's description. Drag them into the order they should appear."
        >
          <PublicSocialEditor
            links={footerSocial}
            onLinksChange={onFooterSocialChange}
            onSaveConfig={onSaveConfig}
          />
        </SettingsRow>
        <SettingsRow
          title="Copyright"
          description="One short copyright line shown beneath the footer links. Leave it empty to show nothing."
        >
          <div className="grid w-full max-w-md gap-2">
            <FieldLabel htmlFor="public-footer-copyright-input" className="font-normal">
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
        </SettingsRow>
      </SettingsRowsCard>

      {editingUserPanel ? (
        <PublicUserPanelDialog
          panel={publicUserPanel}
          onClose={() => setEditingUserPanel(false)}
          onSave={(next) => {
            onPublicUserPanelChange(next)
            setEditingUserPanel(false)
          }}
        />
      ) : null}
    </CardGroup>
  )
}

/**
 * The per-kind switches for the "Home / Page" trail, one row of switch tiles.
 *
 * One switch per kind rather than per page: the shell's public pages are flat,
 * so a page list would be dozens of rows all saying the same thing.
 */
function PublicBreadcrumbSettings({
  breadcrumbs,
  onChange,
}: {
  breadcrumbs: PublicBreadcrumbs
  onChange: (breadcrumbs: PublicBreadcrumbs) => void
}) {
  return (
    <SettingsRow
      title="Breadcrumbs"
      description="Show a short trail under the header, so a visitor arriving from a search result can see where they are. The front page never shows one."
    >
      {PUBLIC_BREADCRUMB_KINDS.map((kind) => (
        <SwitchTile
          key={kind}
          id={`public-breadcrumbs-${kind}`}
          checked={breadcrumbs[kind]}
          onCheckedChange={(checked) => onChange({ ...breadcrumbs, [kind]: checked })}
          label={PUBLIC_BREADCRUMB_LABELS[kind]}
          hint={PUBLIC_BREADCRUMB_HINTS[kind]}
        />
      ))}
    </SettingsRow>
  )
}

/** A number in pixels in a tile, its unit drawn inside the box. */
function PixelTile({
  id,
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  return (
    <SettingsTile className="relative w-52">
      <NumberField
        id={id}
        label={label}
        hint={hint}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        labelClassName="[&_label]:font-normal"
        inputClassName="h-9 w-full pr-8"
        onChange={onChange}
      />
      <span aria-hidden className="pointer-events-none absolute right-6 bottom-3 flex h-9 items-center text-xs text-muted-foreground">
        px
      </span>
    </SettingsTile>
  )
}

/**
 * The header's own settings, three rows: how it behaves, its sizes, and its
 * look. Logo size and Menu position are picked by a small drawing of each.
 */
function PublicHeaderRows({
  header,
  pageWidth,
  chromeFont,
  onChange,
  onChromeFontChange,
}: {
  header: PublicHeader
  pageWidth: number
  chromeFont: PublicThemeChromeFont
  onChange: (header: PublicHeader) => void
  onChromeFontChange: (font: PublicThemeChromeFont) => void
}) {
  const update = (patch: Partial<PublicHeader>) =>
    onChange({ ...header, ...patch })

  return (
    <>
      <SettingsRow
        title="Header behaviour"
        description="Choose how the full public header behaves on every public page."
      >
        <SwitchTile
          id="public-header-sticky"
          checked={header.sticky}
          onCheckedChange={(sticky) => update({ sticky })}
          label="Sticky header"
          hint="Keeps the header at the top while a visitor scrolls."
        />
        <SwitchTile
          id="public-header-full-width"
          checked={header.fullWidth}
          onCheckedChange={(fullWidth) => update({ fullWidth })}
          label="Full width"
          hint="Spreads the logo, menu and buttons across the whole window instead of stopping at a set width."
        />
        <SettingsTile className="flex w-52 items-center justify-between gap-2 py-2">
          <FieldLabel
            htmlFor="public-header-blur"
            hint="How much the page behind the header is blurred as it scrolls under a sticky header. A solid header colour from Styling covers it."
            className="min-w-0 font-normal"
          >
            Glass blur
          </FieldLabel>
          <Select
            value={header.blur}
            onValueChange={(blur) => update({ blur: blur as PublicHeader["blur"] })}
          >
            <SelectTrigger id="public-header-blur" className="h-8 w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_HEADER_BLURS.map((blur) => (
                <SelectItem key={blur} value={blur}>
                  {PUBLIC_HEADER_BLUR_LABELS[blur]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsTile>
      </SettingsRow>

      <SettingsRow title="Header sizing">
        <PixelTile
          id="public-header-width"
          label="Navigation width"
          hint={
            header.fullWidth
              ? "Full width is on, so the header spans the whole window and this number waits until it is off."
              : `The widest the logo, menu and buttons spread, from ${MIN_PUBLIC_HEADER_WIDTH} to ${MAX_PUBLIC_HEADER_WIDTH}. It follows the page width in Styling until you type a number here.`
          }
          value={header.width ?? pageWidth}
          min={MIN_PUBLIC_HEADER_WIDTH}
          max={MAX_PUBLIC_HEADER_WIDTH}
          disabled={header.fullWidth}
          onChange={(width) => update({ width })}
        />
        <PixelTile
          id="public-header-logo-gap"
          label="Space after the logo"
          hint={`Empty space between the logo and the first menu word, from ${MIN_PUBLIC_HEADER_LOGO_GAP} to ${MAX_PUBLIC_HEADER_LOGO_GAP}. It moves the menu along the bar on screens 1024px and wider. Phones are unchanged, because the menu is behind the menu button there.`}
          value={header.logoGap}
          min={MIN_PUBLIC_HEADER_LOGO_GAP}
          max={MAX_PUBLIC_HEADER_LOGO_GAP}
          onChange={(logoGap) => update({ logoGap })}
        />
        <PixelTile
          id="public-header-menu-font-size"
          label="Menu text size"
          hint={`How big the menu words are, from ${MIN_PUBLIC_HEADER_MENU_FONT_SIZE} to ${MAX_PUBLIC_HEADER_MENU_FONT_SIZE}. ${DEFAULT_PUBLIC_HEADER_MENU_FONT_SIZE} is the size the menu has always been. Every word in the menu follows it, on a phone as well, including the links inside a group.`}
          value={header.menuFontSize}
          min={MIN_PUBLIC_HEADER_MENU_FONT_SIZE}
          max={MAX_PUBLIC_HEADER_MENU_FONT_SIZE}
          onChange={(menuFontSize) => update({ menuFontSize })}
        />
        <ChoiceTiles
          id="public-header-logo-size"
          label="Logo size"
          hint="Sets the logo height to 32, 48 or 64 pixels."
          value={header.logoSize}
          onChange={(logoSize) => update({ logoSize })}
          options={PUBLIC_HEADER_LOGO_SIZES.map((size) => ({
            value: size,
            label: size === "small" ? "Small" : size === "large" ? "Large" : "Medium",
            drawing: (
              <span className="flex w-full items-center justify-between">
                <LogoMark size={size} />
                <MenuDashes />
              </span>
            ),
          }))}
        />
      </SettingsRow>

      <SettingsRow title="Header style">
        <SettingsTile className="w-52">
          <FieldLabel
            htmlFor="public-header-font"
            hint="The face the public header and footer read in. Same as the body leaves them on the site's own font."
            className="font-normal"
          >
            Navigation &amp; footer font
          </FieldLabel>
          <Select
            value={chromeFont}
            onValueChange={(font) => onChromeFontChange(font as PublicThemeChromeFont)}
          >
            <SelectTrigger id="public-header-font" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PUBLIC_THEME_CHROME_FONTS.map((font) => (
                <SelectItem key={font} value={font}>
                  {PUBLIC_THEME_HEADING_FONT_LABELS[font]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsTile>
        <ChoiceTiles
          id="public-header-menu-alignment"
          label="Menu position"
          hint="Centre places the desktop menu in the middle of the page. Phone navigation stays in its menu button."
          value={header.menuAlignment}
          onChange={(menuAlignment) => update({ menuAlignment })}
          options={PUBLIC_HEADER_MENU_ALIGNMENTS.map((alignment) => ({
            value: alignment,
            label: alignment === "center" ? "Centre" : "Left",
            drawing:
              alignment === "center" ? (
                <span className="grid w-full grid-cols-[1fr_auto_1fr] items-center">
                  <LogoMark size="small" />
                  <MenuDashes />
                </span>
              ) : (
                <span className="flex w-full items-center gap-1.5">
                  <LogoMark size="small" />
                  <MenuDashes />
                </span>
              ),
          }))}
        />
      </SettingsRow>
    </>
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
  const [creatingLink, setCreatingLink] = React.useState(false)
  const [pendingDeleteIndex, setPendingDeleteIndex] = React.useState<
    number | null
  >(null)
  const sensors = useNavSensors()
  // Ids that travel with the item, not with its slot, so a dropped chip
  // slides into place the way the top-right chips do.
  const itemIds = stableItemIds(links, id)
  const linkNoun = title === "Public footer" ? "footer link" : "menu link"
  const footerAtLimit =
    !allowGroups &&
    links.filter(isPublicNavigationLink).length >= MAX_PUBLIC_FOOTER_LINKS

  const handleDragEnd = (event: DragEndEvent) => {
    const moved = reorderByDrag(links, itemIds, event)
    if (moved) onLinksChange(moved)
  }

  const changeGroup = (index: number, group: PublicNavigationGroup) => {
    onLinksChange(
      links.map((item, at) =>
        at === index && isPublicNavigationGroup(item) ? group : item
      ) as T[]
    )
  }

  /**
   * Writes the menu and waits for the settings save, so the link window knows
   * whether it may close. A refused save puts the menu back as it was: nothing
   * reached the server, so the list must not keep a link the reload would not
   * show, and pressing Done again must not add a second copy of it. The header
   * says why the save was refused.
   */
  const saveLinks = async (nextLinks: T[]) => {
    onLinksChange(nextLinks)
    const saved = await onSaveConfig()
    if (!saved) onLinksChange(links)
    return saved
  }

  const saveLink = (index: number, link: PublicNavigationLink) =>
    saveLinks(links.map((item, at) => (at === index ? (link as T) : item)))

  const addLink = () => setCreatingLink(true)
  // The + the add popovers hang from.
  const addRef = React.useRef<HTMLButtonElement>(null)

  const pendingDeleteItem =
    pendingDeleteIndex === null ? null : links[pendingDeleteIndex]
  const pendingDeleteEntry =
    pendingDeleteItem &&
    (isPublicNavigationLink(pendingDeleteItem) ||
      isPublicNavigationGroup(pendingDeleteItem))
      ? pendingDeleteItem
      : null

  const editor = (
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
            isPublicNavigationGroup(item) ? (
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
                // The header menu is the one editor that allows groups
                // and the one that chooses screens. Two facts, one flag,
                // because only the header has either.
                perDevice={allowGroups}
                dialogOpen={openIndex === index}
                onDialogOpenChange={(open) =>
                  setOpenIndex(open ? index : null)
                }
                onSave={(nextLink) => saveLink(index, nextLink)}
                onDelete={() => setPendingDeleteIndex(index)}
              />
            )
          )}
          {allowGroups ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  ref={addRef}
                  type="button"
                  className={ADD_CHIP_CLASS}
                  aria-label="Add item to public menu"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add
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
                ref={addRef}
                type="button"
                disabled={footerAtLimit}
                onClick={addLink}
                className={cn(ADD_CHIP_CLASS, "disabled:cursor-not-allowed disabled:opacity-50")}
                aria-label={`Add link to ${title.toLowerCase()}`}
              >
                <PlusIcon className="h-4 w-4" />
                Add
              </button>
            </DisabledReason>
          )}
        </div>
      </SortableContext>
    </DndContext>
  )

  return (
    <>
      <SettingsRow title={title} description={description}>
        {editor}
      </SettingsRow>

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
          anchorRef={addRef}
          onClose={() => setCreatingGroup(false)}
          onSave={(group) => {
            onLinksChange([...links, group] as T[])
            setCreatingGroup(false)
          }}
        />
      ) : null}

      {creatingLink ? (
        <PublicLinkDialog
          anchorRef={addRef}
          linkNoun={linkNoun}
          perDevice={allowGroups}
          onClose={() => setCreatingLink(false)}
          onSave={(link) => saveLinks([...links, link as T])}
        />
      ) : null}
    </>
  )
}

type PublicGroupDraftLink = PublicNavigationLink & { id: string }

type PublicGroupDraft = {
  label: string
  links: PublicGroupDraftLink[]
  device: PublicDevice
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
  const chip = useSortableChip(id, label || "dropdown group")
  const nameRef = React.useRef<HTMLButtonElement>(null)

  return (
    <div {...chip} className={cn(CHIP_CLASS, chip.className)}>
      <div className="flex max-w-full items-center gap-1">
        <span className={DRAG_GRIP_CLASS} aria-hidden="true">
          <GripVertical className="h-4 w-4" />
        </span>
        <Button
          ref={nameRef}
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
          anchorRef={nameRef}
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
  anchorRef,
  onClose,
  onSave,
  onDelete,
}: {
  group?: PublicNavigationGroup
  /** The chip or + that opened it, which the popover hangs from. */
  anchorRef: React.RefObject<HTMLElement | null>
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
      device: draft.device,
    })
  }

  return (
    <FormPopover
      dirty={dirty}
      onClose={onClose}
      anchorRef={anchorRef}
      wide
      aria-label={group ? group.label : "New dropdown group"}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        nameRef.current?.focus()
      }}
    >
      {(requestClose) => (
        <>
          <EditPopoverHeader
            title={group ? group.label : "New dropdown group"}
            description="Name the dropdown and put its links in the order visitors should see them."
          />
          <EditPopoverBody>
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
                <PublicDeviceField
                  id="public-menu-group-device"
                  device={draft.device}
                  onChange={(device) =>
                    setDraft((current) => ({ ...current, device }))
                  }
                />
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
                    onDragEnd={(event) =>
                      setDraft((current) => {
                        const links = reorderByDrag(
                          current.links,
                          linkIds,
                          event
                        )
                        return links ? { ...current, links } : current
                      })
                    }
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
          </EditPopoverBody>
          <EditPopoverFooter>
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
          </EditPopoverFooter>
        </>
      )}
    </FormPopover>
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
    device: normalizePublicDevice(group?.device),
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
    draft.device !== normalizePublicDevice(group.device) ||
    draft.links.length !== group.links.length ||
    draft.links.some(
      (link, index) =>
        link.label !== group.links[index]?.label ||
        link.href !== group.links[index]?.href
    )
  )
}

function PublicLinkChip({
  id,
  link,
  linkNoun,
  perDevice,
  dialogOpen,
  onDialogOpenChange,
  onSave,
  onDelete,
}: {
  id: string
  link: PublicNavigationLink
  linkNoun: string
  /** Only the header menu chooses screens; see PublicDeviceField. */
  perDevice: boolean
  dialogOpen: boolean
  onDialogOpenChange: (open: boolean) => void
  onSave: (link: PublicNavigationLink) => Promise<boolean>
  onDelete: () => void
}) {
  const label = link.label.trim()
  const itemName = label || linkNoun
  const chip = useSortableChip(id, itemName)
  const nameRef = React.useRef<HTMLButtonElement>(null)

  return (
    <div {...chip} className={cn(CHIP_CLASS, chip.className)}>
      <div className="flex max-w-full items-center gap-1">
        <span className={DRAG_GRIP_CLASS} aria-hidden="true">
          <GripVertical className="h-4 w-4" />
        </span>
        <Button
          ref={nameRef}
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

      {dialogOpen ? (
        <PublicLinkDialog
          link={link}
          anchorRef={nameRef}
          linkNoun={linkNoun}
          perDevice={perDevice}
          onClose={() => onDialogOpenChange(false)}
          onSave={onSave}
          onDelete={() => {
            onDialogOpenChange(false)
            onDelete()
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * One menu link, edited as a draft.
 *
 * The window holds its own copy until Done, for the reason PublicGroupDialog
 * does: Escape and a click outside must leave the saved menu exactly as it was.
 * Done then checks the draft against the same rule the save applies
 * (`isSafeWrittenPageLink`, through getPublicAddressProblem) and stays open
 * on a problem, because the save silently drops a link with no label or an
 * unsafe address, and a window that closed on "Saved" and lost the link is the
 * bug this replaces.
 */
function PublicLinkDialog({
  link,
  anchorRef,
  linkNoun,
  perDevice,
  onClose,
  onSave,
  onDelete,
}: {
  /** The saved link being edited, or nothing for a link being added. */
  link?: PublicNavigationLink
  /** The chip or + that opened it, which the popover hangs from. */
  anchorRef: React.RefObject<HTMLElement | null>
  linkNoun: string
  perDevice: boolean
  onClose: () => void
  /** Puts the link in the menu and waits for the settings save. */
  onSave: (link: PublicNavigationLink) => Promise<boolean>
  onDelete?: () => void
}) {
  const id = React.useId()
  const [draft, setDraft] = React.useState<PublicNavigationLink>(
    () => link ?? { label: "", href: "" }
  )
  const [attempted, setAttempted] = React.useState(false)
  const [labelTouched, setLabelTouched] = React.useState(false)
  const [addressTouched, setAddressTouched] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const labelInputRef = React.useRef<HTMLInputElement>(null)
  const addressInputRef = React.useRef<HTMLInputElement>(null)
  const labelErrorId = `${id}-label-error`
  const label = draft.label.trim()
  const named = Boolean(label)
  const addressProblem = getPublicAddressProblem(draft.href, true)
  const labelInvalid = (attempted || labelTouched) && !named
  const addressInvalid = Boolean(
    (attempted || addressTouched) && addressProblem
  )
  const dirty = publicLinkDraftIsDirty(draft, link)

  const save = async () => {
    setAttempted(true)
    if (!named) {
      labelInputRef.current?.focus()
      return
    }
    if (addressProblem) {
      showErrorToast(addressProblem)
      addressInputRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      const saved = await onSave({
        ...draft,
        label,
        href: draft.href.trim(),
      })
      if (saved) onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormPopover
      dirty={dirty}
      busy={saving}
      onClose={onClose}
      anchorRef={anchorRef}
      aria-label={link?.label.trim() || linkNoun}
      onOpenAutoFocus={(event) => {
        if (named) return
        event.preventDefault()
        labelInputRef.current?.focus()
      }}
    >
      {(requestClose) => (
        <>
          <EditPopoverHeader
            title={link?.label.trim() || linkNoun}
            description={link ? `Edit this public ${linkNoun}.` : `Add a ${linkNoun}.`}
          />
          <EditPopoverBody>
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
                    value={draft.label}
                    maxLength={MAX_PUBLIC_NAVIGATION_LABEL_LENGTH}
                    placeholder="About"
                    disabled={saving}
                    aria-invalid={labelInvalid || undefined}
                    aria-describedby={labelInvalid ? labelErrorId : undefined}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                    onBlur={() => setLabelTouched(true)}
                  />
                  {labelInvalid ? (
                    <InlineError id={labelErrorId} className="text-xs">
                      Label is required.
                    </InlineError>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor={`${id}-href`}>Address</FieldLabel>
                  <Input
                    ref={addressInputRef}
                    id={`${id}-href`}
                    value={draft.href}
                    maxLength={MAX_PUBLIC_NAVIGATION_HREF_LENGTH}
                    placeholder="/about"
                    disabled={saving}
                    aria-invalid={addressInvalid || undefined}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        href: event.target.value,
                      }))
                    }
                    onBlur={() => {
                      setAddressTouched(true)
                      if (addressProblem) showErrorToast(addressProblem)
                    }}
                  />
                </div>
                {perDevice ? (
                  <PublicDeviceField
                    id={`${id}-device`}
                    device={draft.device}
                    onChange={(device) =>
                      setDraft((current) => ({ ...current, device }))
                    }
                  />
                ) : null}
              </CardContent>
            </Card>
          </EditPopoverBody>
          <EditPopoverFooter>
            {onDelete ? (
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                disabled={saving}
                onClick={onDelete}
              >
                Delete link
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Done
            </Button>
          </EditPopoverFooter>
        </>
      )}
    </FormPopover>
  )
}

function publicLinkDraftIsDirty(
  draft: PublicNavigationLink,
  link?: PublicNavigationLink
) {
  const saved = link ?? { label: "", href: "" }
  return (
    draft.label !== saved.label ||
    draft.href !== saved.href ||
    normalizePublicDevice(draft.device) !== normalizePublicDevice(saved.device)
  )
}

/**
 * Which screens a header menu item is drawn on. The footer never offers it:
 * the footer is one list at every width, so there is nothing to choose
 * between.
 */
function PublicDeviceField({
  id,
  device,
  onChange,
}: {
  id: string
  device: PublicDevice | undefined
  onChange: (device: PublicDevice) => void
}) {
  const value = normalizePublicDevice(device)

  return (
    <SettingsSelectRow
      id={id}
      label="Shown on"
      hint={PUBLIC_DEVICE_HINTS[value]}
      value={value}
      options={PUBLIC_DEVICES}
      optionLabel={(option) => PUBLIC_DEVICE_LABELS[option]}
      onValueChange={onChange}
    />
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
