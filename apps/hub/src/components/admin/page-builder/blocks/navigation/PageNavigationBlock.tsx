"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/shared/AdminModalLayout"
import { BlockTabs } from "@/components/admin/shared/BlockTabs"
import { cn } from "@/lib/utils/tailwind"
import {
  QUICK_LINK_ICON_OPTIONS,
  getQuickLinkIcon,
  getQuickLinkIconOrNull,
  type QuickLinkIconName,
} from "@/lib/utils/site-quick-links"
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
import { Check, Globe, GripVertical, ImageIcon, Plus, Search, Trash2 } from "lucide-react"
import { NAVIGATION_STYLES } from "."
import { VisibilitySettings } from "../shared/VisibilitySettings"

interface NavigationLink {
  text: string
  url: string
  id?: string
  icon?: QuickLinkIconName
}

interface NavigationButton {
  text: string
  url: string
  style: "primary" | "outline" | "ghost"
  showOnMobile?: boolean
  id?: string
  icon?: QuickLinkIconName
}

interface PageNavigationBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onContentPersist?: (nextContent: Record<string, any>) => Promise<boolean>
  siteId: string
  blockId: string
  siteFavicon?: string
  onBack?: () => void
}

const ACTION_BUTTON_CLASS =
  "h-9 w-9 shrink-0 rounded-md p-0 text-foreground hover:bg-muted/50"

function createNavigationItemId(prefix: "link" | "button") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function NavigationIconField({
  value,
  onChange,
}: {
  value?: QuickLinkIconName
  onChange: (value?: QuickLinkIconName) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const SelectedIcon = getQuickLinkIconOrNull(value)
  const DefaultIcon = getQuickLinkIcon()
  const normalizedQuery = query.trim().toLowerCase()
  const showDefaultOption =
    !normalizedQuery || "default icon".includes(normalizedQuery)

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
      <div className="space-y-2">
        <p className="text-sm font-medium">Icon</p>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full shrink-0 px-3",
            SelectedIcon
              ? "w-9 p-0"
              : "text-muted-foreground"
          )}
          onClick={() => setOpen(true)}
        >
          {SelectedIcon ? (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
              <SelectedIcon className="h-4 w-4 shrink-0" />
            </span>
          ) : (
            <span className="text-center text-[10px] leading-tight font-medium">
              Choose Icon
            </span>
          )}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) {
            setQuery("")
          }
        }}
      >
        <AdminModalContent className="max-w-xl">
          <AdminModalHeader className="pb-2">
            <AdminModalTitle>Choose Icon</AdminModalTitle>
            <AdminModalDescription>
              Pick an icon for this navigation item.
            </AdminModalDescription>
          </AdminModalHeader>

          <AdminModalBody
            className="space-y-3 pb-6"
            onWheelCapture={(event) => event.stopPropagation()}
          >
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder="Search icons"
              />
            </div>

            <ScrollArea className="h-[320px] pr-2 overscroll-contain">
              {filteredOptions.length === 0 && !showDefaultOption ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No icons match that search.
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-2">
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
                        !value ? "bg-primary/5" : "hover:bg-muted/50"
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
                          isSelected ? "bg-primary/5" : "hover:bg-muted/50"
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
            </ScrollArea>
          </AdminModalBody>

          <AdminModalFooter className="sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                setQuery("")
              }}
            >
              Back
            </Button>
          </AdminModalFooter>
        </AdminModalContent>
      </Dialog>
    </>
  )
}

function SortableLinkItem({
  link,
  index,
  onEdit,
  onChange,
  onDelete,
}: {
  link: NavigationLink
  index: number
  onEdit: (index: number) => void
  onChange: (index: number, patch: Pick<NavigationLink, "text" | "url" | "icon">) => void
  onDelete: (index: number) => void
}) {
  const itemId = link.id || createNavigationItemId("link")
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const SelectedIcon = getQuickLinkIconOrNull(link.icon)

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
          {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0" /> : null}
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

function SortableButtonItem({
  button,
  index,
  onEdit,
  onChange,
  onDelete,
}: {
  button: NavigationButton
  index: number
  onEdit: (index: number) => void
  onChange: (index: number, nextButton: NavigationButton) => void
  onDelete: (index: number) => void
}) {
  const itemId = button.id || createNavigationItemId("button")
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const SelectedIcon = getQuickLinkIconOrNull(button.icon)

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
          {SelectedIcon ? <SelectedIcon className="h-4 w-4 shrink-0" /> : null}
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

export function PageNavigationBlock({
  content,
  onContentChange,
  onContentPersist,
  siteId,
  blockId,
  siteFavicon,
  onBack,
}: PageNavigationBlockProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null)
  const [editingButtonIndex, setEditingButtonIndex] = useState<number | null>(null)
  const [linkDraft, setLinkDraft] = useState<Pick<NavigationLink, "text" | "url" | "icon">>({
    text: "",
    url: "",
    icon: undefined,
  })
  const [buttonDraft, setButtonDraft] = useState<NavigationButton>({
    text: "",
    url: "",
    style: "primary",
    showOnMobile: false,
    icon: undefined,
  })
  const [modalSaving, setModalSaving] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const logo = content.logo || ""
  const logoUrl = content.logoUrl || ""
  const links = useMemo<NavigationLink[]>(
    () => (Array.isArray(content.links) ? content.links : []),
    [content.links]
  )
  const buttons = useMemo<NavigationButton[]>(
    () => (Array.isArray(content.buttons) ? content.buttons : []),
    [content.buttons]
  )
  const showAuthenticatedUserMenu = content.showAuthenticatedUserMenu === true
  const navigationStyle = content.navigationStyle || "default"
  const styleConfig = useMemo<Record<string, any>>(
    () => (content.styleConfig && typeof content.styleConfig === "object" ? content.styleConfig : {}),
    [content.styleConfig]
  )
  const currentStyleConfig = useMemo<Record<string, any>>(
    () => styleConfig[navigationStyle] || {},
    [navigationStyle, styleConfig]
  )

  const handleStyleConfigChange = useCallback((field: string, value: any) => {
    const updated = {
      ...styleConfig,
      [navigationStyle]: {
        ...currentStyleConfig,
        [field]: value,
      },
    }
    onContentChange("styleConfig", updated)
  }, [styleConfig, navigationStyle, currentStyleConfig, onContentChange])

  useEffect(() => {
    if (!Array.isArray(links)) return
    if (!links.some((link) => !link.id)) return

    onContentChange(
      "links",
      links.map((link) => ({
        ...link,
        id: link.id || createNavigationItemId("link"),
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
        id: button.id || createNavigationItemId("button"),
      }))
    )
  }, [buttons, onContentChange])

  const addLink = () => {
    onContentChange("links", [
      ...links,
      {
        text: "",
        url: "",
        id: createNavigationItemId("link"),
      },
    ])
  }

  const openLinkEditor = (index: number) => {
    const link = links[index]
    if (!link) return

    setLinkDraft({
      text: link.text,
      url: link.url,
      icon: link.icon,
    })
    setEditingLinkIndex(index)
  }

  const updateLink = (index: number, patch: Pick<NavigationLink, "text" | "url" | "icon">) => {
    const nextLinks = [...links]
    nextLinks[index] = { ...nextLinks[index], ...patch }

    onContentChange(
      "links",
      nextLinks
    )
  }

  const removeLink = (index: number) => {
    onContentChange("links", links.filter((_, itemIndex) => itemIndex !== index))
  }

  const saveLinkEditor = () => {
    if (editingLinkIndex === null) return
    const nextLinks = [...links]
    nextLinks[editingLinkIndex] = {
      ...nextLinks[editingLinkIndex],
      text: linkDraft.text,
      url: linkDraft.url.trim(),
      icon: linkDraft.icon,
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
    onContentChange("buttons", [
      ...buttons,
      {
        text: "",
        url: "",
        style: "primary" as const,
        showOnMobile: false,
        id: createNavigationItemId("button"),
      },
    ])
  }

  const openButtonEditor = (index: number) => {
    const button = buttons[index]
    if (!button) return

    setButtonDraft({
      ...button,
      showOnMobile: button.showOnMobile === true,
    })
    setEditingButtonIndex(index)
  }

  const updateButton = (index: number, nextButton: NavigationButton) => {
    const nextButtons = [...buttons]
    nextButtons[index] = nextButton

    onContentChange(
      "buttons",
      nextButtons
    )
  }

  const removeButton = (index: number) => {
    onContentChange("buttons", buttons.filter((_, itemIndex) => itemIndex !== index))
  }

  const saveButtonEditor = () => {
    if (editingButtonIndex === null) return
    const nextButtons = [...buttons]
    nextButtons[editingButtonIndex] = {
      ...(buttons[editingButtonIndex] || {}),
      ...buttonDraft,
      url: buttonDraft.url.trim(),
      showOnMobile: buttonDraft.showOnMobile === true,
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

  const handleButtonDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = buttons.findIndex((button) => button.id === active.id)
    const newIndex = buttons.findIndex((button) => button.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onContentChange("buttons", arrayMove(buttons, oldIndex, newIndex))
  }

  const ActivePanel = NAVIGATION_STYLES[navigationStyle]?.AdminPanel

  return (
    <>
      <BlockTabs
        onBack={onBack}
        tabs={[
        {
          value: "content",
          label: "Content",
          content: (
            <>
              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Logo</CardTitle>
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
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Navigation Links</CardTitle>
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
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleLinkDragEnd}
                    >
                      <SortableContext
                        items={links.map((link) => link.id || "")}
                        strategy={horizontalListSortingStrategy}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {links.map((link, index) => (
                            <SortableLinkItem
                              key={link.id || `nav-link-${index}`}
                              link={link}
                              index={index}
                              onEdit={openLinkEditor}
                              onChange={updateLink}
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
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Action Buttons</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {buttons.length === 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
                        No action buttons.
                      </div>
                      <button
                        type="button"
                        onClick={addButton}
                        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                        aria-label="Add action button"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleButtonDragEnd}
                    >
                      <SortableContext
                        items={buttons.map((button) => button.id || "")}
                        strategy={horizontalListSortingStrategy}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {buttons.map((button, index) => (
                            <SortableButtonItem
                              key={button.id || `nav-button-${index}`}
                              button={button}
                              index={index}
                              onEdit={openButtonEditor}
                              onChange={updateButton}
                              onDelete={removeButton}
                            />
                          ))}
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
                  )}
                </CardContent>
              </Card>
            </>
          ),
        },
        {
          value: "styling",
          label: "Styling",
          content: (
            <>
              {ActivePanel && (
                <ActivePanel
                  config={currentStyleConfig}
                  onConfigChange={handleStyleConfigChange}
                  siteId={siteId}
                  blockId={blockId}
                />
              )}
            </>
          ),
        },
        {
          value: "settings",
          label: "Settings",
          content: (
            <>
              <div className="my-12 mx-4 mb-4 space-y-2">
                <Label className="px-1 text-sm font-medium">Navigation Style</Label>
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

              <VisibilitySettings
                title="Element Visibility"
                visibility={content.visibility}
                onChange={(value) => onContentChange("visibility", value)}
                includeHideBlock={false}
                fields={[
                  { key: "ctaButtons", label: "CTA Buttons" },
                ]}
              />

              <VisibilitySettings
                title="Block Visibility"
                visibility={content.visibility}
                onChange={(value) => onContentChange("visibility", value)}
                fields={[]}
              />

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Navigation Width</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={currentStyleConfig.containerWidth === "full"}
                          onCheckedChange={(checked) =>
                            handleStyleConfigChange("containerWidth", checked ? "full" : "custom")
                          }
                        />
                        <Label className="text-sm">Full Width</Label>
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
                              handleStyleConfigChange(
                                "customWidth",
                                Number.isNaN(parsedValue) ? undefined : parsedValue
                              )
                            }}
                            placeholder="1152"
                            className="h-auto w-full px-3 py-2 text-sm"
                          />
                        </div>
                      )}
                    </div>
                    {currentStyleConfig.containerWidth !== "full" && (
                      <p className="text-xs text-muted-foreground">
                        Default: 1152px · Range: 320-2560px
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Account Menu</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={showAuthenticatedUserMenu}
                      onCheckedChange={(checked) =>
                        onContentChange("showAuthenticatedUserMenu", checked === true)
                      }
                    />
                    <div className="space-y-0.5">
                      <Label>Show User Menu When Signed In</Label>
                      <p className="text-sm text-muted-foreground">
                        Swap CTA buttons for a dashboard/account menu after login
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Dark Mode</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={currentStyleConfig.showDarkModeToggle !== false}
                      onCheckedChange={(checked) =>
                        handleStyleConfigChange("showDarkModeToggle", checked)
                      }
                    />
                    <div className="space-y-0.5">
                      <Label>Show Toggle</Label>
                      <p className="text-sm text-muted-foreground">
                        Display theme switcher in navigation
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ),
        },
        ]}
      />

      <Dialog
        open={editingLinkIndex !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingLinkIndex(null)
          }
        }}
      >
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Navigation Link Settings</AdminModalTitle>
            <AdminModalDescription>
              Update the label, destination URL, and optional icon for this link.
            </AdminModalDescription>
          </AdminModalHeader>

          <AdminModalBody className="space-y-6 pb-6">
            <div className="grid gap-4 md:grid-cols-[auto_minmax(0,180px)_minmax(0,1fr)] md:items-end">
              <NavigationIconField
                value={linkDraft.icon}
                onChange={(icon) => setLinkDraft((prev) => ({ ...prev, icon }))}
              />

              <div className="space-y-2">
                <p className="text-sm font-medium">Name</p>
                <Input
                  value={linkDraft.text}
                  onChange={(event) => setLinkDraft((prev) => ({ ...prev, text: event.target.value }))}
                  placeholder="Label"
                  aria-label="Navigation link name"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">URL</p>
                <Input
                  value={linkDraft.url}
                  onChange={(event) => setLinkDraft((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="/about or https://example.com"
                  aria-label="Navigation link URL"
                />
              </div>
            </div>
          </AdminModalBody>

          <AdminModalFooter className="sm:justify-end">
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
          </AdminModalFooter>
        </AdminModalContent>
      </Dialog>

      <Dialog
        open={editingButtonIndex !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingButtonIndex(null)
          }
        }}
      >
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Action Button Settings</AdminModalTitle>
            <AdminModalDescription>
              Update the label, destination URL, style, mobile visibility, and optional icon.
            </AdminModalDescription>
          </AdminModalHeader>

          <AdminModalBody className="pb-6">
            <div className="grid grid-cols-[92px_140px_minmax(0,1fr)_120px_auto] items-end gap-4">
              <NavigationIconField
                value={buttonDraft.icon}
                onChange={(icon) => setButtonDraft((prev) => ({ ...prev, icon }))}
              />

              <div className="space-y-2">
                <p className="text-sm font-medium">Name</p>
                <Input
                  value={buttonDraft.text}
                  onChange={(event) => setButtonDraft((prev) => ({ ...prev, text: event.target.value }))}
                  placeholder="Label"
                  aria-label="Action button name"
                />
              </div>

              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium">URL</p>
                <Input
                  value={buttonDraft.url}
                  onChange={(event) => setButtonDraft((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="/contact or https://example.com"
                  aria-label="Action button URL"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Style</p>
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
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Show on mobile</p>
                <div className="flex h-9 items-center gap-3 rounded-md border border-input px-3 shadow-xs">
                  <Checkbox
                    checked={buttonDraft.showOnMobile === true}
                    onCheckedChange={(checked) =>
                      setButtonDraft((prev) => ({ ...prev, showOnMobile: checked === true }))
                    }
                    id="navigation-button-show-mobile"
                  />
                  <Label htmlFor="navigation-button-show-mobile">Enabled</Label>
                </div>
              </div>
            </div>
          </AdminModalBody>

          <AdminModalFooter className="sm:justify-end">
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
          </AdminModalFooter>
        </AdminModalContent>
      </Dialog>
    </>
  )
}
