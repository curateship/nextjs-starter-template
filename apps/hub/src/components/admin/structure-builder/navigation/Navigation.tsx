"use client"

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { ShellIconPickerField, ShellIconPreview } from "@/components/admin/layout/settings/ShellIconPicker"
import { cn } from "@/lib/utils/tailwind"
import {
  ACCOUNT_MENU_ACTION_ITEM_ID,
  DARK_MODE_ACTION_ITEM_ID,
  type BuiltInNavigationActionItemId,
  getResolvedNavigationButtonId,
  getSavedNavigationButtonIds,
  normalizeNavigationActionItemOrder
} from "@/lib/utils/navigation-action-items"
import {
  createDefaultNavigationAccountMenu,
  normalizeNavigationAccountMenu,
  type NavigationAccountMenuSettings,
  type NavigationActionSettings,
  type NavigationSignedInLinkSettings
} from "@/lib/utils/site-structure"
import { isQuickLinkIconValue, type QuickLinkIconValue } from "@/lib/utils/site-quick-links"
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
  verticalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Check,
  Contrast,
  Globe,
  GripVertical,
  ImageIcon,
  Plus,
  Trash2,
  type LucideIcon,
  UserRound,
  ArrowLeft
} from "lucide-react"
import { NAVIGATION_STYLES } from "@/components/admin/structure-builder/navigation"

interface NavigationLink {
  text: string
  url: string
  id?: string
  icon?: QuickLinkIconValue
}

interface NavigationButton {
  text: string
  url: string
  style: "primary" | "outline" | "ghost"
  showOnMobile?: boolean
  id?: string
  icon?: QuickLinkIconValue
}

interface NavigationProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onContentPersist?: (nextContent: Record<string, any>) => Promise<boolean>
  siteId: string
  blockId: string
  siteFavicon?: string
  onBack?: () => void
}

type OrderedActionItem =
  | {
      id: string
      kind: "button"
      button: NavigationButton
      index: number
    }
  | {
      id: BuiltInNavigationActionItemId
      kind: "special"
      label: string
      hidden: boolean
      icon: LucideIcon
    }

const ACTION_BUTTON_CLASS = "h-9 w-9 shrink-0 rounded-md p-0 text-foreground hover:bg-muted/50"

type AccountMenuActionKey = "login" | "register"

function createNavigationItemId(prefix: "link" | "button") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function arraysEqual(left: string[], right: unknown) {
  if (!Array.isArray(right) || left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function ensureSignedInLinkIds(links: NavigationSignedInLinkSettings[]): NavigationSignedInLinkSettings[] {
  return links.map((link) => ({
    ...link,
    id: link.id || createNavigationItemId("link")
  }))
}

function NavigationActionSettingsFields({
  action,
  fieldPrefix,
  siteId,
  onChange
}: {
  action: NavigationActionSettings
  fieldPrefix: string
  siteId: string
  onChange: (nextAction: NavigationActionSettings) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <ShellIconPickerField siteId={siteId} value={action.icon} onChange={(value) => onChange({ ...action, icon: value })} />

      <Field className="w-full sm:w-[140px]">
        <FieldLabel htmlFor={`${fieldPrefix}-label`}>Name</FieldLabel>
        <Input
          id={`${fieldPrefix}-label`}
          value={action.text}
          onChange={(event) => onChange({ ...action, text: event.target.value })}
          placeholder="Label"
        />
      </Field>

      <Field className="min-w-[220px] flex-1">
        <FieldLabel htmlFor={`${fieldPrefix}-url`}>URL</FieldLabel>
        <Input
          id={`${fieldPrefix}-url`}
          value={action.url}
          onChange={(event) => onChange({ ...action, url: event.target.value })}
          placeholder="/account or https://example.com"
        />
      </Field>

      <Field className="w-full sm:w-[120px]">
        <FieldLabel>Style</FieldLabel>
        <Select
          value={action.style}
          onValueChange={(value: NavigationActionSettings["style"]) => onChange({ ...action, style: value })}
        >
          <SelectTrigger size="button" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="primary">Primary</SelectItem>
            <SelectItem value="outline">Outline</SelectItem>
            <SelectItem value="ghost">Ghost</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field className="w-full sm:w-auto">
        <FieldLabel htmlFor={`${fieldPrefix}-mobile`}>Show on mobile</FieldLabel>
        <div className="flex h-9 items-center gap-3 rounded-md border border-input px-3">
          <Checkbox
            checked={action.showOnMobile === true}
            onCheckedChange={(checked) => onChange({ ...action, showOnMobile: checked === true })}
            id={`${fieldPrefix}-mobile`}
          />
          <span className="text-sm font-medium">Enabled</span>
        </div>
      </Field>
    </div>
  )
}

function NavigationActionSettingsSection({
  title,
  description,
  action,
  fieldPrefix,
  siteId,
  onChange
}: {
  title: string
  description: string
  action: NavigationActionSettings
  fieldPrefix: string
  siteId: string
  onChange: (nextAction: NavigationActionSettings) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <NavigationActionSettingsFields action={action} fieldPrefix={fieldPrefix} siteId={siteId} onChange={onChange} />
    </div>
  )
}

function SortableLinkItem({
  link,
  index,
  onEdit,
  onDelete
}: {
  link: NavigationLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  const itemId = link.id || createNavigationItemId("link")
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: itemId })

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
          aria-label={`Reorder ${link.text || "navigation link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(index)}
          className="h-9 max-w-[220px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${link.text || "navigation link"}`}
          title={link.text || "Navigation link settings"}
        >
          <ShellIconPreview icon={link.icon} className="h-4 w-4 shrink-0" />
          <span className="truncate">{link.text || "Link"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${link.text || "navigation link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function StaticLinkItem({
  link,
  index,
  onEdit,
  onDelete
}: {
  link: NavigationLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  return (
    <div className="w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50">
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(index)}
          className="h-9 max-w-[220px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${link.text || "navigation link"}`}
          title={link.text || "Navigation link settings"}
        >
          <ShellIconPreview icon={link.icon} className="h-4 w-4 shrink-0" />
          <span className="truncate">{link.text || "Link"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${link.text || "navigation link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function UserPanelChildLinkRow({
  link,
  index,
  onChange,
  onDelete,
  siteId,
  dragHandle,
  setNodeRef,
  style
}: {
  link: NavigationSignedInLinkSettings
  index: number
  onChange: (index: number, patch: Partial<NavigationSignedInLinkSettings>) => void
  onDelete: (index: number) => void
  siteId: string
  dragHandle: ReactNode
  setNodeRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
}) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid items-center gap-2 rounded-md border bg-background p-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_minmax(0,1fr)_auto]"
    >
      {dragHandle}
      <ShellIconPickerField siteId={siteId} value={link.icon} onChange={(icon) => onChange(index, { icon })} compact />
      <Input
        value={link.text}
        onChange={(event) => onChange(index, { text: event.target.value })}
        placeholder="Child label"
        aria-label="Child label"
        className="border-transparent bg-transparent shadow-none hover:bg-muted/40 focus-visible:bg-background"
      />
      <Input
        value={link.url}
        onChange={(event) => onChange(index, { url: event.target.value })}
        placeholder="/account or https://example.com"
        aria-label="Child URL"
        className="border-transparent bg-transparent shadow-none hover:bg-muted/40 focus-visible:bg-background"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(index)}
        aria-label={`Delete ${link.text || "child link"}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function SortableUserPanelChildLink({
  link,
  index,
  onChange,
  onDelete,
  siteId
}: {
  link: NavigationSignedInLinkSettings
  index: number
  onChange: (index: number, patch: Partial<NavigationSignedInLinkSettings>) => void
  onDelete: (index: number) => void
  siteId: string
}) {
  const itemId = link.id || `user-panel-child-${index}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: itemId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1
  }

  return (
    <UserPanelChildLinkRow
      link={link}
      index={index}
      onChange={onChange}
      onDelete={onDelete}
      siteId={siteId}
      setNodeRef={setNodeRef}
      style={style}
      dragHandle={
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Reorder ${link.text || "child link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      }
    />
  )
}

function StaticUserPanelChildLink({
  link,
  index,
  onChange,
  onDelete,
  siteId
}: {
  link: NavigationSignedInLinkSettings
  index: number
  onChange: (index: number, patch: Partial<NavigationSignedInLinkSettings>) => void
  onDelete: (index: number) => void
  siteId: string
}) {
  return (
    <UserPanelChildLinkRow
      link={link}
      index={index}
      onChange={onChange}
      onDelete={onDelete}
      siteId={siteId}
      dragHandle={
        <div className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      }
    />
  )
}

function SortableButtonItem({
  button,
  index,
  onEdit,
  onDelete
}: {
  button: NavigationButton
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  const itemId = button.id || createNavigationItemId("button")
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: itemId })

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
          aria-label={`Reorder ${button.text || "action button"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(index)}
          className="h-9 max-w-[220px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${button.text || "action button"}`}
          title={button.text || "Action button settings"}
        >
          <ShellIconPreview icon={button.icon} className="h-4 w-4 shrink-0" />
          <span className="truncate">{button.text || "Button"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${button.text || "action button"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function StaticButtonItem({
  button,
  index,
  onEdit,
  onDelete
}: {
  button: NavigationButton
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  return (
    <div className="w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50">
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(index)}
          className="h-9 max-w-[220px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${button.text || "action button"}`}
          title={button.text || "Action button settings"}
        >
          <ShellIconPreview icon={button.icon} className="h-4 w-4 shrink-0" />
          <span className="truncate">{button.text || "Button"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${button.text || "action button"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function SortableBuiltInActionItem({
  item,
  onEdit
}: {
  item: Extract<OrderedActionItem, { kind: "special" }>
  onEdit: (itemId: BuiltInNavigationActionItemId) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }
  const Icon = item.icon

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
          aria-label={`Reorder ${item.label}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(item.id)}
          className="h-9 max-w-[260px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${item.label}`}
          title={`${item.label} settings`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
          {item.hidden ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Hidden
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  )
}

function StaticBuiltInActionItem({
  item,
  onEdit
}: {
  item: Extract<OrderedActionItem, { kind: "special" }>
  onEdit: (itemId: BuiltInNavigationActionItemId) => void
}) {
  const Icon = item.icon

  return (
    <div className="w-fit max-w-full rounded-lg border bg-background p-2 transition-colors hover:border-muted-foreground/50">
      <div className="flex max-w-full flex-wrap items-center gap-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(item.id)}
          className="h-9 max-w-[260px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${item.label}`}
          title={`${item.label} settings`}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
          {item.hidden ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Hidden
            </span>
          ) : null}
        </Button>
      </div>
    </div>
  )
}

export function Navigation({ content, onContentChange, onContentPersist, siteId, siteFavicon, onBack }: NavigationProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [sortableReady, setSortableReady] = useState(false)
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null)
  const [editingButtonIndex, setEditingButtonIndex] = useState<number | null>(null)
  const [editingBuiltInActionItem, setEditingBuiltInActionItem] = useState<BuiltInNavigationActionItemId | null>(null)
  const [linkDraft, setLinkDraft] = useState<Pick<NavigationLink, "text" | "url" | "icon">>({
    text: "",
    url: "",
    icon: undefined
  })
  const [buttonDraft, setButtonDraft] = useState<NavigationButton>({
    text: "",
    url: "",
    style: "primary",
    showOnMobile: false,
    icon: undefined
  })
  const [accountMenuDraft, setAccountMenuDraft] = useState<NavigationAccountMenuSettings>(() =>
    createDefaultNavigationAccountMenu()
  )
  const [darkModeDraft, setDarkModeDraft] = useState(true)
  const [darkModeMobileDraft, setDarkModeMobileDraft] = useState(true)
  const [modalSaving, setModalSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const logo = content.logo || ""
  const logoUrl = content.logoUrl || ""
  const links = useMemo<NavigationLink[]>(() => (Array.isArray(content.links) ? content.links : []), [content.links])
  const buttons = useMemo<NavigationButton[]>(
    () => (Array.isArray(content.buttons) ? content.buttons : []),
    [content.buttons]
  )
  const accountMenu = useMemo(() => normalizeNavigationAccountMenu(content.accountMenu), [content.accountMenu])
  const rawAccountMenu = useMemo<Record<string, any>>(
    () => (content.accountMenu && typeof content.accountMenu === "object" ? content.accountMenu : {}),
    [content.accountMenu]
  )
  const signedInLinks = useMemo<NavigationSignedInLinkSettings[]>(() => {
    if (!Array.isArray(rawAccountMenu.signedInLinks)) {
      return accountMenu.signedInLinks
    }

    return rawAccountMenu.signedInLinks
      .filter((link): link is Record<string, unknown> => !!link && typeof link === "object")
      .map((link) => ({
        id: typeof link.id === "string" ? link.id : undefined,
        text: typeof link.text === "string" ? link.text : "",
        url: typeof link.url === "string" ? link.url : "",
        icon: isQuickLinkIconValue(link.icon) ? link.icon : undefined
      }))
  }, [accountMenu.signedInLinks, rawAccountMenu])
  const navigationStyle = content.navigationStyle || "default"
  const styleConfig = useMemo<Record<string, any>>(
    () => (content.styleConfig && typeof content.styleConfig === "object" ? content.styleConfig : {}),
    [content.styleConfig]
  )
  const currentStyleConfig = useMemo<Record<string, any>>(
    () => styleConfig[navigationStyle] || {},
    [navigationStyle, styleConfig]
  )
  const resolvedButtonIds = useMemo(
    () => buttons.map((button, index) => getResolvedNavigationButtonId(button, index)),
    [buttons]
  )
  const actionItemOrder = useMemo(
    () => normalizeNavigationActionItemOrder(content.actionItemOrder, resolvedButtonIds),
    [content.actionItemOrder, resolvedButtonIds]
  )
  const orderedActionItems = useMemo<OrderedActionItem[]>(() => {
    const buttonItems = new Map(
      buttons.map((button, index) => [
        resolvedButtonIds[index],
        {
          id: resolvedButtonIds[index],
          kind: "button" as const,
          button,
          index
        }
      ])
    )
    const specialItems = new Map<BuiltInNavigationActionItemId, OrderedActionItem>([
      [
        ACCOUNT_MENU_ACTION_ITEM_ID,
        {
          id: ACCOUNT_MENU_ACTION_ITEM_ID,
          kind: "special",
          label: "User Panel",
          hidden: false,
          icon: UserRound
        }
      ],
      [
        DARK_MODE_ACTION_ITEM_ID,
        {
          id: DARK_MODE_ACTION_ITEM_ID,
          kind: "special",
          label: "Theme Switcher",
          hidden: currentStyleConfig.showDarkModeToggle === false,
          icon: Contrast
        }
      ]
    ])

    return actionItemOrder.flatMap((itemId) => {
      if (itemId === ACCOUNT_MENU_ACTION_ITEM_ID || itemId === DARK_MODE_ACTION_ITEM_ID) {
        const specialItem = specialItems.get(itemId)
        return specialItem ? [specialItem] : []
      }

      const buttonItem = buttonItems.get(itemId)
      return buttonItem ? [buttonItem] : []
    })
  }, [actionItemOrder, buttons, currentStyleConfig.showDarkModeToggle, resolvedButtonIds])

  const handleStyleConfigChange = useCallback(
    (field: string, value: any) => {
      const updated = {
        ...styleConfig,
        [navigationStyle]: {
          ...currentStyleConfig,
          [field]: value
        }
      }
      onContentChange("styleConfig", updated)
    },
    [styleConfig, navigationStyle, currentStyleConfig, onContentChange]
  )

  useEffect(() => {
    setSortableReady(true)
  }, [])

  useEffect(() => {
    if (!Array.isArray(links)) return
    if (!links.some((link) => !link.id)) return

    onContentChange(
      "links",
      links.map((link) => ({
        ...link,
        id: link.id || createNavigationItemId("link")
      }))
    )
  }, [links, onContentChange])

  useEffect(() => {
    if (!Array.isArray(buttons)) return
    if (!buttons.some((button) => !button.id)) return

    onContentChange(
      "buttons",
      buttons.map((button) => ({
        ...button,
        id: button.id || createNavigationItemId("button")
      }))
    )
  }, [buttons, onContentChange])

  useEffect(() => {
    if (!signedInLinks.some((link) => !link.id)) return

    onContentChange("accountMenu", {
      ...accountMenu,
      signedInLinks: signedInLinks.map((link) => ({
        ...link,
        id: link.id || createNavigationItemId("link")
      }))
    })
  }, [accountMenu, onContentChange, signedInLinks])

  useEffect(() => {
    const savedButtonIds = getSavedNavigationButtonIds(buttons)
    if (buttons.length > 0 && savedButtonIds.length !== buttons.length) return

    const nextOrder = normalizeNavigationActionItemOrder(content.actionItemOrder, savedButtonIds)
    if (arraysEqual(nextOrder, content.actionItemOrder)) return

    onContentChange("actionItemOrder", nextOrder)
  }, [buttons, content.actionItemOrder, onContentChange])

  const addLink = () => {
    onContentChange("links", [
      ...links,
      {
        text: "",
        url: "",
        id: createNavigationItemId("link")
      }
    ])
  }

  const openLinkEditor = (index: number) => {
    const link = links[index]
    if (!link) return

    setLinkDraft({
      text: link.text,
      url: link.url,
      icon: link.icon
    })
    setEditingLinkIndex(index)
  }

  const removeLink = (index: number) => {
    onContentChange(
      "links",
      links.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const saveLinkEditor = () => {
    if (editingLinkIndex === null) return
    const nextLinks = [...links]
    nextLinks[editingLinkIndex] = {
      ...nextLinks[editingLinkIndex],
      text: linkDraft.text,
      url: linkDraft.url.trim(),
      icon: linkDraft.icon
    }

    const nextContent = { ...content, links: nextLinks }

    if (!onContentPersist) {
      onContentChange("links", nextLinks)
      setEditingLinkIndex(null)
      return
    }

    setModalSaving(true)
    void onContentPersist(nextContent)
      .then((success) => {
        if (success) {
          setEditingLinkIndex(null)
        }
      })
      .finally(() => {
        setModalSaving(false)
      })
  }

  const handleLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = links.findIndex((link) => link.id === active.id)
    const newIndex = links.findIndex((link) => link.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onContentChange("links", arrayMove(links, oldIndex, newIndex))
  }

  const addButton = () => {
    const nextButton = {
      text: "",
      url: "",
      style: "primary" as const,
      showOnMobile: false,
      id: createNavigationItemId("button")
    }
    const nextButtons = [...buttons, nextButton]

    onContentChange("buttons", nextButtons)
    onContentChange(
      "actionItemOrder",
      normalizeNavigationActionItemOrder(actionItemOrder, [...getSavedNavigationButtonIds(nextButtons)])
    )
  }

  const openButtonEditor = (index: number) => {
    const button = buttons[index]
    if (!button) return

    setButtonDraft({
      ...button,
      showOnMobile: button.showOnMobile === true
    })
    setEditingButtonIndex(index)
  }

  const openBuiltInActionItemEditor = (itemId: BuiltInNavigationActionItemId) => {
    if (itemId === ACCOUNT_MENU_ACTION_ITEM_ID) {
      setAccountMenuDraft({
        ...accountMenu,
        signedInLinks: ensureSignedInLinkIds(signedInLinks)
      })
    } else {
      setDarkModeDraft(currentStyleConfig.showDarkModeToggle !== false)
      setDarkModeMobileDraft(currentStyleConfig.showDarkModeToggleOnMobile !== false)
    }

    setEditingBuiltInActionItem(itemId)
  }

  const removeButton = (index: number) => {
    const nextButtons = buttons.filter((_, itemIndex) => itemIndex !== index)
    const removedItemId = resolvedButtonIds[index]

    onContentChange("buttons", nextButtons)
    onContentChange(
      "actionItemOrder",
      normalizeNavigationActionItemOrder(
        actionItemOrder.filter((itemId) => itemId !== removedItemId),
        getSavedNavigationButtonIds(nextButtons)
      )
    )
  }

  const saveButtonEditor = () => {
    if (editingButtonIndex === null) return
    const nextButtons = [...buttons]
    nextButtons[editingButtonIndex] = {
      ...(buttons[editingButtonIndex] || {}),
      ...buttonDraft,
      url: buttonDraft.url.trim(),
      showOnMobile: buttonDraft.showOnMobile === true
    }

    const nextContent = { ...content, buttons: nextButtons }

    if (!onContentPersist) {
      onContentChange("buttons", nextButtons)
      setEditingButtonIndex(null)
      return
    }

    setModalSaving(true)
    void onContentPersist(nextContent)
      .then((success) => {
        if (success) {
          setEditingButtonIndex(null)
        }
      })
      .finally(() => {
        setModalSaving(false)
      })
  }

  const handleActionItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = actionItemOrder.findIndex((itemId) => itemId === active.id)
    const newIndex = actionItemOrder.findIndex((itemId) => itemId === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onContentChange("actionItemOrder", arrayMove(actionItemOrder, oldIndex, newIndex))
  }

  const updateAccountMenuActionDraft = (actionKey: AccountMenuActionKey, nextAction: NavigationActionSettings) => {
    setAccountMenuDraft((prev) => ({
      ...prev,
      [actionKey]: nextAction
    }))
  }

  const addAccountMenuSignedInLinkDraft = () => {
    setAccountMenuDraft((prev) => ({
      ...prev,
      signedInLinks: [
        ...prev.signedInLinks,
        {
          id: createNavigationItemId("link"),
          text: "",
          url: ""
        }
      ]
    }))
  }

  const updateAccountMenuSignedInLinkDraft = (index: number, patch: Partial<NavigationSignedInLinkSettings>) => {
    setAccountMenuDraft((prev) => ({
      ...prev,
      signedInLinks: prev.signedInLinks.map((link, itemIndex) => (itemIndex === index ? { ...link, ...patch } : link))
    }))
  }

  const removeAccountMenuSignedInLinkDraft = (index: number) => {
    setAccountMenuDraft((prev) => ({
      ...prev,
      signedInLinks: prev.signedInLinks.filter((_, itemIndex) => itemIndex !== index)
    }))
  }

  const handleAccountMenuSignedInLinkDraftDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setAccountMenuDraft((prev) => {
      const oldIndex = prev.signedInLinks.findIndex(
        (link, index) => (link.id || `user-panel-child-${index}`) === active.id
      )
      const newIndex = prev.signedInLinks.findIndex(
        (link, index) => (link.id || `user-panel-child-${index}`) === over.id
      )

      if (oldIndex === -1 || newIndex === -1) return prev

      return {
        ...prev,
        signedInLinks: arrayMove(prev.signedInLinks, oldIndex, newIndex)
      }
    })
  }

  const getAccountMenuDraftForSave = () => ({
    ...accountMenuDraft,
    login: {
      ...accountMenuDraft.login,
      url: accountMenuDraft.login.url.trim()
    },
    register: {
      ...accountMenuDraft.register,
      url: accountMenuDraft.register.url.trim()
    },
    signedInLinks: accountMenuDraft.signedInLinks.map((link) => ({
      ...link,
      text: link.text.trim(),
      url: link.url.trim()
    }))
  })

  const saveBuiltInActionItemEditor = () => {
    if (!editingBuiltInActionItem) return

    let nextContent = content
    if (editingBuiltInActionItem === ACCOUNT_MENU_ACTION_ITEM_ID) {
      nextContent = {
        ...content,
        accountMenu: getAccountMenuDraftForSave()
      }
    } else {
      nextContent = {
        ...content,
        styleConfig: {
          ...styleConfig,
          [navigationStyle]: {
            ...currentStyleConfig,
            showDarkModeToggle: darkModeDraft,
            showDarkModeToggleOnMobile: darkModeMobileDraft
          }
        }
      }
    }

    if (!onContentPersist) {
      if (editingBuiltInActionItem === ACCOUNT_MENU_ACTION_ITEM_ID) {
        onContentChange("accountMenu", getAccountMenuDraftForSave())
      } else {
        onContentChange("styleConfig", {
          ...styleConfig,
          [navigationStyle]: {
            ...currentStyleConfig,
            showDarkModeToggle: darkModeDraft,
            showDarkModeToggleOnMobile: darkModeMobileDraft
          }
        })
      }
      setEditingBuiltInActionItem(null)
      return
    }

    setModalSaving(true)
    void onContentPersist(nextContent)
      .then((success) => {
        if (success) {
          setEditingBuiltInActionItem(null)
        }
      })
      .finally(() => {
        setModalSaving(false)
      })
  }

  return (
    <>
      <div className="flex w-full flex-col gap-4">
        {onBack && (
          <div className="px-4 pt-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-muted px-3 text-sm font-medium text-muted-foreground transition-all hover:bg-background hover:text-foreground hover:shadow-sm"
            >
              <ArrowLeft className="mr-1.5 h-4 w-3.5" />
              Back
            </button>
          </div>
        )}

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Settings</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start">
                  <div className="shrink-0 pr-4">
                    {logo && logo !== "/images/logo.png" ? (
                      <div
                        className="relative h-12 w-32 cursor-pointer overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-90"
                        onClick={() => setShowPicker(true)}
                      >
                        <img
                          src={logo}
                          alt="Logo"
                          className="h-full w-full object-contain"
                          onError={(event) => {
                            event.currentTarget.style.display = "none"
                          }}
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100">
                          <div className="text-center text-white">
                            <ImageIcon className="mx-auto mb-1 h-4 w-4" />
                            <p className="text-xs font-medium">Click to change</p>
                          </div>
                        </div>
                      </div>
                    ) : siteFavicon ? (
                      <div className="cursor-pointer" onClick={() => setShowPicker(true)}>
                        <img
                          src={siteFavicon}
                          alt="Site favicon (used as logo)"
                          className="h-10 w-10 cursor-pointer object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        className="flex h-12 w-32 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                        onClick={() => setShowPicker(true)}
                      >
                        <div className="text-center">
                          <Globe className="mx-auto h-4 w-4 text-muted-foreground/50" />
                          <p className="mt-1 text-xs text-muted-foreground">Click to select</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <input
                      id="logoUrl"
                      type="text"
                      value={logoUrl}
                      onChange={(event) => onContentChange("logoUrl", event.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="https://example.com (leave empty for site homepage)"
                    />
                  </div>
                </div>

                {siteFavicon && (!logo || logo === "/images/logo.png") && (
                  <p className="text-xs text-muted-foreground">
                    Currently using favicon as fallback logo. Click on image to change
                  </p>
                )}
              </div>

              <MediaPicker
                open={showPicker}
                onOpenChange={setShowPicker}
                onSelectMedia={(imageUrl) => {
                  onContentChange("logo", imageUrl)
                  setShowPicker(false)
                }}
                currentMediaUrl={logo}
              />

              <div className="space-y-6 pt-6">
                <div className="space-y-2">
                  <p className="px-1 text-sm font-medium">Navigation Style</p>
                  <div className="grid max-w-sm grid-cols-2 gap-2">
                    {Object.entries(NAVIGATION_STYLES).map(([key, style]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onContentChange("navigationStyle", key)}
                        className={cn(
                          "relative flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                          navigationStyle === key
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            navigationStyle === key
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          )}
                        >
                          {navigationStyle === key && <Check className="h-3 w-3" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{style.label}</div>
                          {style.description && (
                            <div className="mt-0.5 text-xs text-muted-foreground">{style.description}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="px-1 text-sm font-medium">Navigation Width</p>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        checked={currentStyleConfig.containerWidth === "full"}
                        onCheckedChange={(checked) =>
                          handleStyleConfigChange("containerWidth", checked ? "full" : "custom")
                        }
                      />
                      <span className="text-sm">Full Width</span>
                    </div>
                    {currentStyleConfig.containerWidth !== "full" && (
                      <div className="w-32">
                        <Input
                          type="number"
                          min="320"
                          max="2560"
                          value={currentStyleConfig.customWidth || ""}
                          onChange={(event) => {
                            const value = event.target.value
                            if (value === "") {
                              handleStyleConfigChange("customWidth", undefined)
                              return
                            }

                            const parsedValue = parseInt(value, 10)
                            handleStyleConfigChange("customWidth", Number.isNaN(parsedValue) ? undefined : parsedValue)
                          }}
                          placeholder="1152"
                          className="h-auto w-full px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                  {currentStyleConfig.containerWidth !== "full" && (
                    <p className="text-xs text-muted-foreground">Default: 1152px · Range: 320-2560px</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="px-1 text-sm font-medium">Glass Blur Effect</p>
                  <div className="w-[180px]">
                    <Select
                      value={currentStyleConfig.blurEffect || "none"}
                      onValueChange={(value: "none" | "light" | "medium" | "heavy") =>
                        handleStyleConfigChange("blurEffect", value)
                      }
                    >
                      <SelectTrigger size="button" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="heavy">Heavy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Navigation Links</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {links.length === 0 ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
                    No navigation links.
                  </div>
                  <button
                    type="button"
                    onClick={addLink}
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                    aria-label="Add navigation link"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : sortableReady ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLinkDragEnd}>
                  <SortableContext items={links.map((link) => link.id || "")} strategy={horizontalListSortingStrategy}>
                    <div className="flex flex-wrap items-center gap-2">
                      {links.map((link, index) => (
                        <SortableLinkItem
                          key={link.id || `nav-link-${index}`}
                          link={link}
                          index={index}
                          onEdit={openLinkEditor}
                          onDelete={removeLink}
                        />
                      ))}
                      <button
                        type="button"
                        onClick={addLink}
                        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                        aria-label="Add navigation link"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {links.map((link, index) => (
                    <StaticLinkItem
                      key={link.id || `nav-link-static-${index}`}
                      link={link}
                      index={index}
                      onEdit={openLinkEditor}
                      onDelete={removeLink}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addLink}
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                    aria-label="Add navigation link"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Action Items</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortableReady ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleActionItemDragEnd}>
                  <SortableContext
                    items={orderedActionItems.map((item) => item.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {orderedActionItems.map((item) =>
                        item.kind === "button" ? (
                          <SortableButtonItem
                            key={item.id}
                            button={item.button}
                            index={item.index}
                            onEdit={openButtonEditor}
                            onDelete={removeButton}
                          />
                        ) : (
                          <SortableBuiltInActionItem key={item.id} item={item} onEdit={openBuiltInActionItemEditor} />
                        )
                      )}
                      <button
                        type="button"
                        onClick={addButton}
                        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                        aria-label="Add action button"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {orderedActionItems.map((item) =>
                    item.kind === "button" ? (
                      <StaticButtonItem
                        key={item.id}
                        button={item.button}
                        index={item.index}
                        onEdit={openButtonEditor}
                        onDelete={removeButton}
                      />
                    ) : (
                      <StaticBuiltInActionItem key={item.id} item={item} onEdit={openBuiltInActionItemEditor} />
                    )
                  )}
                  <button
                    type="button"
                    onClick={addButton}
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                    aria-label="Add action button"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={editingLinkIndex !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingLinkIndex(null)
          }
        }}
      >
        <DashboardModalContent
          title="Navigation Link Settings"
          description="Update the label, destination URL, and optional icon for this link."
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setEditingLinkIndex(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={modalSaving}
                onClick={() => setLinkDraft((prev) => ({ ...prev, icon: undefined }))}
              >
                Remove Icon
              </Button>
              <Button type="button" disabled={modalSaving} onClick={saveLinkEditor}>
                {modalSaving ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <CardGroup className="grid">
            <Card>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-[auto_minmax(0,180px)_minmax(0,1fr)] md:items-end">
                  <ShellIconPickerField
                    siteId={siteId}
                    value={linkDraft.icon}
                    onChange={(icon) => setLinkDraft((prev) => ({ ...prev, icon }))}
                  />

                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      value={linkDraft.text}
                      onChange={(event) =>
                        setLinkDraft((prev) => ({
                          ...prev,
                          text: event.target.value
                        }))
                      }
                      placeholder="Label"
                      aria-label="Navigation link name"
                    />
                  </Field>

                  <Field>
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      value={linkDraft.url}
                      onChange={(event) =>
                        setLinkDraft((prev) => ({
                          ...prev,
                          url: event.target.value
                        }))
                      }
                      placeholder="/about or https://example.com"
                      aria-label="Navigation link URL"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </Dialog>

      <Dialog
        open={editingButtonIndex !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingButtonIndex(null)
          }
        }}
      >
        <DashboardModalContent
          title="Action Button Settings"
          description="Update the label, destination URL, style, mobile visibility, and optional icon."
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setEditingButtonIndex(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={modalSaving}
                onClick={() => setButtonDraft((prev) => ({ ...prev, icon: undefined }))}
              >
                Remove Icon
              </Button>
              <Button type="button" disabled={modalSaving} onClick={saveButtonEditor}>
                {modalSaving ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <CardGroup className="grid">
            <Card>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-[92px_140px_minmax(0,1fr)_120px_auto] md:items-end">
                  <ShellIconPickerField
                    siteId={siteId}
                    value={buttonDraft.icon}
                    onChange={(icon) => setButtonDraft((prev) => ({ ...prev, icon }))}
                  />

                  <Field>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      value={buttonDraft.text}
                      onChange={(event) =>
                        setButtonDraft((prev) => ({
                          ...prev,
                          text: event.target.value
                        }))
                      }
                      placeholder="Label"
                      aria-label="Action button name"
                    />
                  </Field>

                  <Field className="min-w-0">
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      value={buttonDraft.url}
                      onChange={(event) =>
                        setButtonDraft((prev) => ({
                          ...prev,
                          url: event.target.value
                        }))
                      }
                      placeholder="/contact or https://example.com"
                      aria-label="Action button URL"
                    />
                  </Field>

                  <Field>
                    <FieldLabel>Style</FieldLabel>
                    <Select
                      value={buttonDraft.style}
                      onValueChange={(value: NavigationButton["style"]) =>
                        setButtonDraft((prev) => ({ ...prev, style: value }))
                      }
                    >
                      <SelectTrigger size="button" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="outline">Outline</SelectItem>
                        <SelectItem value="ghost">Ghost</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel>Show on mobile</FieldLabel>
                    <div className="flex h-9 items-center gap-3 rounded-md border border-input px-3 shadow-xs">
                      <Checkbox
                        checked={buttonDraft.showOnMobile === true}
                        onCheckedChange={(checked) =>
                          setButtonDraft((prev) => ({
                            ...prev,
                            showOnMobile: checked === true
                          }))
                        }
                        id="navigation-button-show-mobile"
                      />
                      <span className="text-sm font-medium">Enabled</span>
                    </div>
                  </Field>
                </div>
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </Dialog>

      <Dialog
        open={editingBuiltInActionItem !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingBuiltInActionItem(null)
          }
        }}
      >
        <DashboardModalContent
          className={cn(editingBuiltInActionItem === ACCOUNT_MENU_ACTION_ITEM_ID && "sm:max-w-3xl")}
          title={editingBuiltInActionItem === ACCOUNT_MENU_ACTION_ITEM_ID ? "User Panel Settings" : "Dark Mode Settings"}
          description={
            editingBuiltInActionItem === ACCOUNT_MENU_ACTION_ITEM_ID
              ? "Control login and register actions plus signed-in child links."
              : "Choose where the theme toggle should render in the navigation."
          }
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => setEditingBuiltInActionItem(null)}>
                Cancel
              </Button>
              <Button type="button" disabled={modalSaving} onClick={saveBuiltInActionItemEditor}>
                {modalSaving ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <CardGroup className="grid">
            {editingBuiltInActionItem === ACCOUNT_MENU_ACTION_ITEM_ID ? (
              <>
                <Card>
                  <CardContent>
                    <NavigationActionSettingsSection
                      title="Login"
                      description="Desktop shows this as a button. Mobile shows it in the account dropdown when enabled for mobile."
                      action={accountMenuDraft.login}
                      fieldPrefix="navigation-account-menu-login"
                      siteId={siteId}
                      onChange={(nextAction) => updateAccountMenuActionDraft("login", nextAction)}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <NavigationActionSettingsSection
                      title="Register"
                      description="Desktop shows this as a button. Mobile shows it in the account dropdown when enabled for mobile."
                      action={accountMenuDraft.register}
                      fieldPrefix="navigation-account-menu-register"
                      siteId={siteId}
                      onChange={(nextAction) => updateAccountMenuActionDraft("register", nextAction)}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Child links</p>
                          <p className="text-xs text-muted-foreground">These appear in the signed-in user dropdown.</p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={addAccountMenuSignedInLinkDraft}>
                          <Plus className="h-4 w-4" />
                          Add Child
                        </Button>
                      </div>

                      {accountMenuDraft.signedInLinks.length ? (
                        sortableReady ? (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleAccountMenuSignedInLinkDraftDragEnd}
                          >
                            <SortableContext
                              items={accountMenuDraft.signedInLinks.map(
                                (link, index) => link.id || `user-panel-child-${index}`
                              )}
                              strategy={verticalListSortingStrategy}
                            >
                              <div className="space-y-2">
                                {accountMenuDraft.signedInLinks.map((link, index) => (
                                  <SortableUserPanelChildLink
                                    key={link.id || `user-panel-child-${index}`}
                                    link={link}
                                    index={index}
                                    siteId={siteId}
                                    onChange={updateAccountMenuSignedInLinkDraft}
                                    onDelete={removeAccountMenuSignedInLinkDraft}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        ) : (
                          <div className="space-y-2">
                            {accountMenuDraft.signedInLinks.map((link, index) => (
                              <StaticUserPanelChildLink
                                key={link.id || `user-panel-child-static-${index}`}
                                link={link}
                                index={index}
                                siteId={siteId}
                                onChange={updateAccountMenuSignedInLinkDraft}
                                onDelete={removeAccountMenuSignedInLinkDraft}
                              />
                            ))}
                          </div>
                        )
                      ) : (
                        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                          No child links.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={darkModeDraft}
                        onCheckedChange={(checked) => setDarkModeDraft(checked === true)}
                        id="navigation-dark-mode-enabled"
                      />
                      <div className="space-y-0.5">
                        <label htmlFor="navigation-dark-mode-enabled" className="text-sm font-medium">Show Toggle</label>
                        <p className="text-sm text-muted-foreground">Display theme switcher in navigation.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={darkModeMobileDraft}
                        onCheckedChange={(checked) => setDarkModeMobileDraft(checked === true)}
                        id="navigation-dark-mode-mobile-enabled"
                      />
                      <div className="space-y-0.5">
                        <label htmlFor="navigation-dark-mode-mobile-enabled" className="text-sm font-medium">Show on mobile</label>
                        <p className="text-sm text-muted-foreground">
                          Display theme switcher in the mobile navigation actions.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardGroup>
        </DashboardModalContent>
      </Dialog>
    </>
  )
}
