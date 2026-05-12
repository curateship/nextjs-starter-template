"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BlockEditorEmptyState, BlockTabs } from "@/components/ui/tabs"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { VisibilitySettings } from "@/components/admin/page-builder/blocks/shared/VisibilitySettings"
import { Card, CardContent, CardDescription, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Check,
  Facebook,
  Github,
  Globe,
  GripVertical,
  ImageIcon,
  Instagram,
  Linkedin,
  Music2,
  Plus,
  Search,
  Trash2,
  Twitter,
  type LucideIcon,
  Youtube,
  X,
} from "lucide-react"
import {
  DIRECTORY_CORE_INTRO_SHORTCODES,
  DIRECTORY_CORE_MENU_LINK_TYPES,
  getDirectoryCoreMenuDefaultIcon,
  getDirectoryCoreMenuTypeLabel,
  getDirectoryCoreMenuValuePlaceholder,
  normalizeDirectoryCoreMenuLink,
  normalizeDirectoryCoreSocialLink,
  type DirectoryCoreMenuLink,
  type DirectoryCoreMenuLinkType,
  type DirectoryCoreSocialLink,
} from "@/lib/actions/directories/directory-core"
import {
  getQuickLinkIcon,
  getQuickLinkIconOrNull,
  QUICK_LINK_ICON_OPTIONS,
  type QuickLinkIconName,
} from "@/lib/utils/site-quick-links"
import { cn } from "@/lib/utils/tailwind"

interface DirectoryCoreBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  directoryData?: {
    title?: string
    featured_image?: string | null
  }
  onDirectoryTitleChange?: (title: string) => void
  onDirectoryFeaturedImageChange?: (featuredImage: string) => void
  onBack?: () => void
  showDirectoryTitleField?: boolean
}

const ACTION_BUTTON_CLASS =
  "h-9 w-9 shrink-0 rounded-md p-0 text-foreground hover:bg-muted/50"

const SOCIAL_PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook", Icon: Facebook },
  { value: "instagram", label: "Instagram", Icon: Instagram },
  { value: "twitter", label: "Twitter", Icon: Twitter },
  { value: "linkedin", label: "LinkedIn", Icon: Linkedin },
  { value: "youtube", label: "YouTube", Icon: Youtube },
  { value: "tiktok", label: "TikTok", Icon: Music2 },
  { value: "github", label: "GitHub", Icon: Github },
] as const

function createCoreItemId(prefix: "menu" | "social") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getSocialPlatformMeta(platform?: string): {
  label: string
  Icon: LucideIcon
} {
  const option = SOCIAL_PLATFORM_OPTIONS.find((item) => item.value === platform)
  if (option) return { label: option.label, Icon: option.Icon }

  if (!platform) return { label: "Social Link", Icon: Globe }
  return {
    label: platform.charAt(0).toUpperCase() + platform.slice(1),
    Icon: Globe,
  }
}

function SocialPlatformLabel({ platform }: { platform?: string }) {
  const { label, Icon } = getSocialPlatformMeta(platform)

  return (
    <span className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </span>
  )
}

function CoreMenuIconField({
  value,
  defaultIcon,
  onChange,
}: {
  value?: QuickLinkIconName
  defaultIcon: QuickLinkIconName
  onChange: (value?: QuickLinkIconName) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const SelectedIcon = getQuickLinkIconOrNull(value)
  const DefaultIcon = getQuickLinkIcon(defaultIcon)
  const DisplayIcon = SelectedIcon || DefaultIcon
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
            "h-9 w-9 shrink-0 p-0",
            !SelectedIcon && "text-muted-foreground"
          )}
          onClick={() => setOpen(true)}
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <DisplayIcon className="h-4 w-4 shrink-0" />
          </span>
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
        <DashboardModalContent
          className="max-w-xl"
          title="Choose Icon"
          description="Pick an icon for this menu link."
          footer={
            <>
              {value ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onChange(undefined)
                    setOpen(false)
                    setQuery("")
                  }}
                >
                  Remove Icon
                </Button>
              ) : null}
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
            </>
          }
        >
          <CardGroup className="grid">
            <Card>
              <CardContent
                className="p-4 space-y-3"
                onWheelCapture={(event) => event.stopPropagation()}
              >
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-9"
                    placeholder="Search icons"
                  />
                </div>

                <ScrollArea className="h-[320px] overscroll-contain pr-2">
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
                            <span className="absolute right-2 top-2 rounded-full bg-primary p-0.5 text-primary-foreground">
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
                              <span className="absolute right-2 top-2 rounded-full bg-primary p-0.5 text-primary-foreground">
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
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </Dialog>
    </>
  )
}

function SortableSocialLinkItem({
  socialLink,
  index,
  onEdit,
  onDelete,
}: {
  socialLink: DirectoryCoreSocialLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: socialLink.id! })

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
          className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Reorder ${socialLink.platform || "social link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(index)}
          className="h-9 max-w-[240px] justify-start px-3 text-sm font-medium"
          aria-label={`Edit settings for ${socialLink.platform || "social link"}`}
          title={socialLink.platform || "Social link settings"}
        >
          <SocialPlatformLabel platform={socialLink.platform} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${socialLink.platform || "social link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function StaticSocialLinkItem({
  socialLink,
  index,
  onEdit,
  onDelete,
}: {
  socialLink: DirectoryCoreSocialLink
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
          className="h-9 max-w-[240px] justify-start px-3 text-sm font-medium"
          aria-label={`Edit settings for ${socialLink.platform || "social link"}`}
          title={socialLink.platform || "Social link settings"}
        >
          <SocialPlatformLabel platform={socialLink.platform} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${socialLink.platform || "social link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function SortableMenuLinkItem({
  menuLink,
  index,
  onEdit,
  onDelete,
}: {
  menuLink: DirectoryCoreMenuLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: menuLink.id! })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const iconName = menuLink.icon || getDirectoryCoreMenuDefaultIcon(menuLink.type)
  const Icon = getQuickLinkIconOrNull(iconName)

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
          aria-label={`Reorder ${menuLink.label || "menu link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(index)}
          className="h-9 max-w-[260px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${menuLink.label || "menu link"}`}
          title={menuLink.label || "Menu link settings"}
        >
          {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
          <span className="truncate">{menuLink.label || getDirectoryCoreMenuTypeLabel(menuLink.type)}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${menuLink.label || "menu link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function StaticMenuLinkItem({
  menuLink,
  index,
  onEdit,
  onDelete,
}: {
  menuLink: DirectoryCoreMenuLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  const iconName = menuLink.icon || getDirectoryCoreMenuDefaultIcon(menuLink.type)
  const Icon = getQuickLinkIconOrNull(iconName)

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
          className="h-9 max-w-[260px] justify-start gap-2 px-3 text-sm font-medium"
          aria-label={`Edit settings for ${menuLink.label || "menu link"}`}
          title={menuLink.label || "Menu link settings"}
        >
          {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
          <span className="truncate">{menuLink.label || getDirectoryCoreMenuTypeLabel(menuLink.type)}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={cn(ACTION_BUTTON_CLASS, "hover:bg-red-50")}
          aria-label={`Delete ${menuLink.label || "menu link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function DirectoryCoreBlock({
  content,
  onContentChange,
  siteId,
  directoryData,
  onDirectoryTitleChange,
  onDirectoryFeaturedImageChange,
  onBack,
  showDirectoryTitleField = true,
}: DirectoryCoreBlockProps) {
  const introTextRef = useRef<HTMLTextAreaElement | null>(null)
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [sortableReady, setSortableReady] = useState(false)
  const [editingSocialLinkIndex, setEditingSocialLinkIndex] = useState<number | null>(null)
  const [creatingSocialLink, setCreatingSocialLink] = useState(false)
  const [editingMenuLinkIndex, setEditingMenuLinkIndex] = useState<number | null>(null)
  const [creatingMenuLink, setCreatingMenuLink] = useState(false)
  const [socialLinkDraft, setSocialLinkDraft] = useState<DirectoryCoreSocialLink>({
    platform: SOCIAL_PLATFORM_OPTIONS[0].value,
    url: "",
  })
  const [menuLinkDraft, setMenuLinkDraft] = useState<DirectoryCoreMenuLink>({
    type: "directions",
    label: "",
    value: "",
  })

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const rawSocialLinks = useMemo(
    () => (Array.isArray(content.socialLinks) ? content.socialLinks : []),
    [content.socialLinks]
  )
  const rawMenuLinks = useMemo(
    () => (Array.isArray(content.menuLinks) ? content.menuLinks : []),
    [content.menuLinks]
  )
  const socialLinks = useMemo<DirectoryCoreSocialLink[]>(
    () => rawSocialLinks
      .map((link, index) => normalizeDirectoryCoreSocialLink(link, index))
      .filter((link): link is DirectoryCoreSocialLink => !!link),
    [rawSocialLinks]
  )
  const menuLinks = useMemo<DirectoryCoreMenuLink[]>(
    () => rawMenuLinks
      .map((link, index) => normalizeDirectoryCoreMenuLink(link, index))
      .filter((link): link is DirectoryCoreMenuLink => !!link),
    [rawMenuLinks]
  )
  const sortableSocialLinksReady = sortableReady && socialLinks.every((link) => !!link.id)
  const sortableMenuLinksReady = sortableReady && menuLinks.every((link) => !!link.id)
  const featuredImage = directoryData?.featured_image || ""
  const introText = typeof content.introText === "string" ? content.introText : ""

  useEffect(() => {
    setSortableReady(true)
  }, [])

  useEffect(() => {
    if (!rawSocialLinks.some((link) => !link?.id)) return

    onContentChange(
      "socialLinks",
      rawSocialLinks
        .map((link, index) => normalizeDirectoryCoreSocialLink(link, index))
        .filter(Boolean)
        .map((link) => ({
          ...link,
          id: link?.id || createCoreItemId("social"),
        }))
    )
  }, [rawSocialLinks, onContentChange])

  useEffect(() => {
    if (!rawMenuLinks.some((link) => !link?.id)) return

    onContentChange(
      "menuLinks",
      rawMenuLinks
        .map((link, index) => normalizeDirectoryCoreMenuLink(link, index))
        .filter(Boolean)
        .map((link) => ({
          ...link,
          id: link?.id || createCoreItemId("menu"),
        }))
    )
  }, [rawMenuLinks, onContentChange])

  const openSocialLinkEditor = (index: number) => {
    const socialLink = socialLinks[index]
    if (!socialLink) return

    setCreatingSocialLink(false)
    setSocialLinkDraft({
      ...socialLink,
      platform: socialLink.platform || SOCIAL_PLATFORM_OPTIONS[0].value,
    })
    setEditingSocialLinkIndex(index)
  }

  const addSocialLink = () => {
    setSocialLinkDraft({
      platform: SOCIAL_PLATFORM_OPTIONS[0].value,
      url: "",
    })
    setCreatingSocialLink(true)
  }

  const removeSocialLink = (index: number) => {
    onContentChange(
      "socialLinks",
      socialLinks.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const saveSocialLinkEditor = () => {
    const nextSocialLinks = creatingSocialLink
      ? [
          ...socialLinks,
          {
            ...socialLinkDraft,
            url: socialLinkDraft.url.trim(),
            id: createCoreItemId("social"),
          },
        ]
      : (() => {
          if (editingSocialLinkIndex === null) return socialLinks

          const nextItems = [...socialLinks]
          nextItems[editingSocialLinkIndex] = {
            ...(socialLinks[editingSocialLinkIndex] || {}),
            ...socialLinkDraft,
            url: socialLinkDraft.url.trim(),
          }
          return nextItems
        })()

    if (!creatingSocialLink && editingSocialLinkIndex === null) return

    onContentChange("socialLinks", nextSocialLinks)
    setCreatingSocialLink(false)
    setEditingSocialLinkIndex(null)
  }

  const handleSocialLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = socialLinks.findIndex((link) => link.id === active.id)
    const newIndex = socialLinks.findIndex((link) => link.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onContentChange("socialLinks", arrayMove(socialLinks, oldIndex, newIndex))
  }

  const openMenuLinkEditor = (index: number) => {
    const menuLink = menuLinks[index]
    if (!menuLink) return

    setCreatingMenuLink(false)
    setMenuLinkDraft({
      ...menuLink,
      icon: menuLink.icon,
    })
    setEditingMenuLinkIndex(index)
  }

  const addMenuLink = () => {
    setMenuLinkDraft({
      type: "directions",
      label: "",
      value: "",
    })
    setCreatingMenuLink(true)
  }

  const removeMenuLink = (index: number) => {
    onContentChange(
      "menuLinks",
      menuLinks.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const saveMenuLinkEditor = () => {
    const nextMenuLinks = creatingMenuLink
      ? [
          ...menuLinks,
          {
            ...menuLinkDraft,
            label: menuLinkDraft.label?.trim() || "",
            value: menuLinkDraft.value?.trim() || "",
            id: createCoreItemId("menu"),
          },
        ]
      : (() => {
          if (editingMenuLinkIndex === null) return menuLinks

          const nextItems = [...menuLinks]
          nextItems[editingMenuLinkIndex] = {
            ...(menuLinks[editingMenuLinkIndex] || {}),
            ...menuLinkDraft,
            label: menuLinkDraft.label?.trim() || "",
            value: menuLinkDraft.value?.trim() || "",
          }
          return nextItems
        })()

    if (!creatingMenuLink && editingMenuLinkIndex === null) return

    onContentChange("menuLinks", nextMenuLinks)
    setCreatingMenuLink(false)
    setEditingMenuLinkIndex(null)
  }

  const handleMenuLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = menuLinks.findIndex((link) => link.id === active.id)
    const newIndex = menuLinks.findIndex((link) => link.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onContentChange("menuLinks", arrayMove(menuLinks, oldIndex, newIndex))
  }

  const updateMenuLinkType = (type: DirectoryCoreMenuLinkType) => {
    setMenuLinkDraft((current) => ({
      ...current,
      type,
    }))
  }

  const insertIntroShortcode = (token: string) => {
    const textarea = introTextRef.current
    const start = textarea?.selectionStart ?? introText.length
    const end = textarea?.selectionEnd ?? introText.length
    const nextIntroText = `${introText.slice(0, start)}${token}${introText.slice(end)}`

    onContentChange("introText", nextIntroText)

    requestAnimationFrame(() => {
      if (!introTextRef.current) return

      const cursor = start + token.length
      introTextRef.current.focus()
      introTextRef.current.setSelectionRange(cursor, cursor)
    })
  }

  const introTextField = (
    <div className="space-y-3">
      <FieldLabel htmlFor="directory-core-intro-text">Intro Text</FieldLabel>
      <Textarea
        ref={introTextRef}
        id="directory-core-intro-text"
        value={introText}
        onChange={(event) => onContentChange("introText", event.target.value)}
        placeholder="{{directory-title}} is an indoor climbing gym in {{parent-category}} {{child-category}}"
        rows={3}
      />
      <div className="flex flex-wrap gap-2">
        {DIRECTORY_CORE_INTRO_SHORTCODES.map((shortcode) => (
          <Button
            key={shortcode}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => insertIntroShortcode(shortcode)}
          >
            {shortcode}
          </Button>
        ))}
      </div>
    </div>
  )

  const tabs = [
    {
      value: "content",
      label: "Content",
      content: (
        <CardGroup className="grid">
          <Card>
            <CardHeader className="p-4 pb-3">
              <DashboardModalCardTitle>Directory Details</DashboardModalCardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 pt-0">
              {showDirectoryTitleField ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="directory-core-title">Title</FieldLabel>
                    <Input
                      id="directory-core-title"
                      value={directoryData?.title || ""}
                      onChange={(event) => onDirectoryTitleChange?.(event.target.value)}
                      placeholder="Directory title"
                      className="text-lg font-medium"
                    />
                  </Field>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">Featured Image</p>
                    {featuredImage ? (
                      <div className="relative h-48 w-full max-w-sm overflow-hidden rounded-lg bg-muted">
                        <img
                          src={featuredImage}
                          alt="Featured image preview"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-background/80 to-transparent" />
                        <button
                          type="button"
                          onClick={() => onDirectoryFeaturedImageChange?.("")}
                          className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div
                          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                          onClick={() => setShowImagePicker(true)}
                        >
                          <div className="text-center text-white">
                            <ImageIcon className="mx-auto mb-2 h-8 w-8" />
                            <p className="text-sm font-medium">Click to change image</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex h-48 w-full max-w-sm cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
                        onClick={() => setShowImagePicker(true)}
                      >
                        <div className="text-center">
                          <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />
                          <p className="mt-2 text-sm text-muted-foreground">Click to select featured image</p>
                        </div>
                      </div>
                    )}
                    <MediaPicker
                      open={showImagePicker}
                      onOpenChange={setShowImagePicker}
                      onSelectMedia={(mediaUrl) => {
                        onDirectoryFeaturedImageChange?.(mediaUrl)
                        setShowImagePicker(false)
                      }}
                      currentMediaUrl={featuredImage}
                      site_id={siteId}
                    />
                  </div>

                  {introTextField}
                </>
              ) : (
                <>
                  <BlockEditorEmptyState>
                    Title and featured image come from each real directory item.
                  </BlockEditorEmptyState>

                  {introTextField}
                </>
              )}
            </CardContent>
          </Card>
        </CardGroup>
      ),
    },
    {
      value: "social",
      label: "Social",
      content: (
        <CardGroup className="grid">
          <Card>
            <CardHeader className="p-4 pb-3">
              <DashboardModalCardTitle>Social Links</DashboardModalCardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
          {socialLinks.length === 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
                No social links.
              </div>
              <button
                type="button"
                onClick={addSocialLink}
                className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                aria-label="Add social link"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : sortableSocialLinksReady ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSocialLinkDragEnd}
            >
              <SortableContext
                items={socialLinks.map((link) => link.id!)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {socialLinks.map((socialLink, index) => (
                    <SortableSocialLinkItem
                      key={socialLink.id}
                      socialLink={socialLink}
                      index={index}
                      onEdit={openSocialLinkEditor}
                      onDelete={removeSocialLink}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addSocialLink}
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                    aria-label="Add social link"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {socialLinks.map((socialLink, index) => (
                <StaticSocialLinkItem
                  key={socialLink.id || `social-link-static-${index}`}
                  socialLink={socialLink}
                  index={index}
                  onEdit={openSocialLinkEditor}
                  onDelete={removeSocialLink}
                />
              ))}
              <button
                type="button"
                onClick={addSocialLink}
                className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                aria-label="Add social link"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
            </CardContent>
          </Card>
        </CardGroup>
      ),
    },
    {
      value: "menu",
      label: "Menu",
      content: (
        <CardGroup className="grid">
          <Card>
            <CardHeader className="p-4 pb-3">
              <DashboardModalCardTitle>Menu Links</DashboardModalCardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
          {menuLinks.length === 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
                No menu links.
              </div>
              <button
                type="button"
                onClick={addMenuLink}
                className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                aria-label="Add menu link"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : sortableMenuLinksReady ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleMenuLinkDragEnd}
            >
              <SortableContext
                items={menuLinks.map((link) => link.id!)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {menuLinks.map((menuLink, index) => (
                    <SortableMenuLinkItem
                      key={menuLink.id}
                      menuLink={menuLink}
                      index={index}
                      onEdit={openMenuLinkEditor}
                      onDelete={removeMenuLink}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={addMenuLink}
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                    aria-label="Add menu link"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {menuLinks.map((menuLink, index) => (
                <StaticMenuLinkItem
                  key={menuLink.id || `menu-link-static-${index}`}
                  menuLink={menuLink}
                  index={index}
                  onEdit={openMenuLinkEditor}
                  onDelete={removeMenuLink}
                />
              ))}
              <button
                type="button"
                onClick={addMenuLink}
                className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                aria-label="Add menu link"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
            </CardContent>
          </Card>
        </CardGroup>
      ),
    },
    {
      value: "settings",
      label: "Settings",
      content: (
        <CardGroup className="grid">
          <Card>
            <CardContent className="p-4">
              <VisibilitySettings
                visibility={content.visibility}
                onChange={(visibility) => onContentChange("visibility", visibility)}
                fields={[
                  { key: "image", label: "Image" },
                  { key: "title", label: "Title" },
                  { key: "introText", label: "Intro Text" },
                  { key: "socialLinks", label: "Social Links" },
                  { key: "menuLinks", label: "Menu Links" },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-3">
              <DashboardModalCardTitle>Sticky</DashboardModalCardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 pt-0">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="directory-core-sticky"
                  checked={content.sticky === true}
                  onCheckedChange={(checked) => onContentChange("sticky", checked === true)}
                />
                <div className="space-y-1">
                  <label htmlFor="directory-core-sticky" className="text-sm font-medium cursor-pointer">
                    Keep block visible while scrolling
                  </label>
                  <p className="text-sm text-muted-foreground">
                    Uses sticky positioning on larger screens.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-3">
              <DashboardModalCardTitle>Claim Listing</DashboardModalCardTitle>
              <CardDescription>
                Let verified business owners request access to edit this listing.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 pt-0">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="directory-core-claim-enabled"
                  checked={content.claimEnabled !== false}
                  onCheckedChange={(checked) => onContentChange("claimEnabled", checked === true)}
                />
                <label htmlFor="directory-core-claim-enabled" className="text-sm font-medium cursor-pointer">
                  Show claim listing action
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="directory-core-claim-button">Button Text</FieldLabel>
                  <Input
                    id="directory-core-claim-button"
                    value={content.claimButtonText ?? "Claim Listing"}
                    onChange={(event) => onContentChange("claimButtonText", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="directory-core-claim-edit-path">Owner Edit Path</FieldLabel>
                  <Input
                    id="directory-core-claim-edit-path"
                    value={content.ownerEditPath ?? "/account"}
                    onChange={(event) => onContentChange("ownerEditPath", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="directory-core-claim-email-text">Pending Email Text</FieldLabel>
                  <Input
                    id="directory-core-claim-email-text"
                    value={content.claimPendingEmailText ?? "Check Business Email"}
                    onChange={(event) => onContentChange("claimPendingEmailText", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="directory-core-claim-review-text">Pending Review Text</FieldLabel>
                  <Input
                    id="directory-core-claim-review-text"
                    value={content.claimPendingReviewText ?? "Claim Pending Review"}
                    onChange={(event) => onContentChange("claimPendingReviewText", event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="directory-core-claim-approved-text">Approved Text</FieldLabel>
                  <Input
                    id="directory-core-claim-approved-text"
                    value={content.claimApprovedText ?? "Edit Listing"}
                    onChange={(event) => onContentChange("claimApprovedText", event.target.value)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
        </CardGroup>
      ),
    },
  ]

  return (
    <>
      <BlockTabs tabs={tabs} onBack={onBack} headerClassName="pt-0" contentClassName="mt-3" />

      <Dialog
        open={editingSocialLinkIndex !== null || creatingSocialLink}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCreatingSocialLink(false)
            setEditingSocialLinkIndex(null)
          }
        }}
      >
        <DashboardModalContent
          title="Social Link Settings"
          description="Update the platform and destination URL for this social link."
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreatingSocialLink(false)
                  setEditingSocialLinkIndex(null)
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={saveSocialLinkEditor}>
                Save
              </Button>
            </>
          }
        >
          <CardGroup className="grid">
            <Card>
              <CardHeader className="p-4 pb-3">
                <DashboardModalCardTitle>Social link</DashboardModalCardTitle>
                <CardDescription>Choose a platform and enter the destination URL.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-end">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Platform</p>
                    <Select
                      value={socialLinkDraft.platform || SOCIAL_PLATFORM_OPTIONS[0].value}
                      onValueChange={(value) =>
                        setSocialLinkDraft((current) => ({ ...current, platform: value }))
                      }
                    >
                      <SelectTrigger size="button" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOCIAL_PLATFORM_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <SocialPlatformLabel platform={option.value} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">URL</p>
                    <Input
                      value={socialLinkDraft.url}
                      onChange={(event) =>
                        setSocialLinkDraft((current) => ({ ...current, url: event.target.value }))
                      }
                      placeholder="https://instagram.com/example"
                      aria-label="Social link URL"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </Dialog>

      <Dialog
        open={editingMenuLinkIndex !== null || creatingMenuLink}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCreatingMenuLink(false)
            setEditingMenuLinkIndex(null)
          }
        }}
      >
        <DashboardModalContent
          title="Menu Link Settings"
          description="Choose an action type, label, value, and optional icon."
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreatingMenuLink(false)
                  setEditingMenuLinkIndex(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setMenuLinkDraft((current) => ({ ...current, icon: undefined }))}
              >
                Remove Icon
              </Button>
              <Button type="button" onClick={saveMenuLinkEditor}>
                Save
              </Button>
            </>
          }
        >
          <CardGroup className="grid">
            <Card>
              <CardHeader className="p-4 pb-3">
                <DashboardModalCardTitle>Menu link</DashboardModalCardTitle>
                <CardDescription>Configure the action type, label, value, and optional icon.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid gap-4 md:grid-cols-[92px_160px_minmax(0,180px)_minmax(0,1fr)] md:items-end">
                  <CoreMenuIconField
                    value={menuLinkDraft.icon}
                    defaultIcon={getDirectoryCoreMenuDefaultIcon(menuLinkDraft.type)}
                    onChange={(icon) => setMenuLinkDraft((current) => ({ ...current, icon }))}
                  />

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Type</p>
                    <Select
                      value={menuLinkDraft.type}
                      onValueChange={(value) => updateMenuLinkType(value as DirectoryCoreMenuLinkType)}
                    >
                      <SelectTrigger size="button" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIRECTORY_CORE_MENU_LINK_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {getDirectoryCoreMenuTypeLabel(type)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">Label</p>
                    <Input
                      value={menuLinkDraft.label || ""}
                      onChange={(event) =>
                        setMenuLinkDraft((current) => ({ ...current, label: event.target.value }))
                      }
                      placeholder={getDirectoryCoreMenuTypeLabel(menuLinkDraft.type)}
                      aria-label="Menu link label"
                    />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium">Value</p>
                    <Input
                      value={menuLinkDraft.value || ""}
                      onChange={(event) =>
                        setMenuLinkDraft((current) => ({ ...current, value: event.target.value }))
                      }
                      placeholder={getDirectoryCoreMenuValuePlaceholder(menuLinkDraft.type)}
                      aria-label="Menu link value"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardGroup>
        </DashboardModalContent>
      </Dialog>
    </>
  )
}
