"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BlockEditorEmptyState } from "@/components/ui/tabs"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { ShellIconPickerField } from "@/components/admin/layout/settings/ShellIconPicker"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
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
  Facebook,
  Github,
  Globe,
  GripVertical,
  ImageIcon,
  Instagram,
  Linkedin,
  Music2,
  Plus,
  Trash2,
  Twitter,
  type LucideIcon,
  Youtube,
  X,
} from "lucide-react"
import {
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

interface DirectoryCoreBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  siteId: string
  directoryTitle?: string
  directoryFeaturedImage?: string | null
  onDirectoryTitleChange?: (title: string) => void
  onDirectoryFeaturedImageChange?: (featuredImage: string) => void
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

function SocialLinkFields({
  dragHandle,
  socialLink,
  index,
  onChange,
  onDelete,
}: {
  dragHandle: ReactNode
  socialLink: DirectoryCoreSocialLink
  index: number
  onChange: (index: number, socialLink: DirectoryCoreSocialLink) => void
  onDelete: (index: number) => void
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[auto_minmax(150px,220px)_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex h-10 items-center">{dragHandle}</div>

      <div>
        <Select
          value={socialLink.platform || SOCIAL_PLATFORM_OPTIONS[0].value}
          onValueChange={(value) => onChange(index, { ...socialLink, platform: value })}
        >
          <SelectTrigger size="button" className="w-full" aria-label="Social platform">
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

      <div className="min-w-0">
        <Input
          value={socialLink.url || ""}
          onChange={(event) => onChange(index, { ...socialLink, url: event.target.value })}
          placeholder="https://instagram.com/example"
          aria-label="Social link URL"
        />
      </div>

      <div className="flex h-10 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={ACTION_BUTTON_CLASS}
          aria-label={`Delete ${socialLink.platform || "social link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function SortableSocialLinkItem({
  socialLink,
  index,
  onChange,
  onDelete,
}: {
  socialLink: DirectoryCoreSocialLink
  index: number
  onChange: (index: number, socialLink: DirectoryCoreSocialLink) => void
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
    <div ref={setNodeRef} style={style}>
      <SocialLinkFields
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Reorder ${socialLink.platform || "social link"}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
        socialLink={socialLink}
        index={index}
        onChange={onChange}
        onDelete={onDelete}
      />
    </div>
  )
}

function StaticSocialLinkItem({
  socialLink,
  index,
  onChange,
  onDelete,
}: {
  socialLink: DirectoryCoreSocialLink
  index: number
  onChange: (index: number, socialLink: DirectoryCoreSocialLink) => void
  onDelete: (index: number) => void
}) {
  return (
    <SocialLinkFields
      dragHandle={
        <div className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      }
      socialLink={socialLink}
      index={index}
      onChange={onChange}
      onDelete={onDelete}
    />
  )
}

function MenuLinkFields({
  dragHandle,
  menuLink,
  index,
  onChange,
  onDelete,
}: {
  dragHandle: ReactNode
  menuLink: DirectoryCoreMenuLink
  index: number
  onChange: (index: number, menuLink: DirectoryCoreMenuLink) => void
  onDelete: (index: number) => void
}) {
  const updateType = (type: DirectoryCoreMenuLinkType) => {
    onChange(index, {
      ...menuLink,
      type,
      value: type === "claim" ? "" : menuLink.value,
    })
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[auto_auto_minmax(140px,180px)_minmax(140px,1fr)_minmax(180px,1.5fr)_auto] sm:items-center">
      <div className="flex h-10 items-center">{dragHandle}</div>

      <ShellIconPickerField
        compact
        allowEmpty={false}
        value={menuLink.icon || getDirectoryCoreMenuDefaultIcon(menuLink.type)}
        onChange={(icon) => onChange(index, { ...menuLink, icon })}
      />

      <div>
        <Select value={menuLink.type} onValueChange={(value) => updateType(value as DirectoryCoreMenuLinkType)}>
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

      <div className="min-w-0">
        <Input
          value={menuLink.label || ""}
          onChange={(event) => onChange(index, { ...menuLink, label: event.target.value })}
          placeholder={getDirectoryCoreMenuTypeLabel(menuLink.type)}
          aria-label="Menu link label"
        />
      </div>

      {menuLink.type !== "claim" ? (
        <div className="min-w-0">
          <Input
            value={menuLink.value || ""}
            onChange={(event) => onChange(index, { ...menuLink, value: event.target.value })}
            placeholder={getDirectoryCoreMenuValuePlaceholder(menuLink.type)}
            aria-label="Menu link value"
          />
        </div>
      ) : (
        <div />
      )}

      <div className="flex h-10 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={ACTION_BUTTON_CLASS}
          aria-label={`Delete ${menuLink.label || "menu link"}`}
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
  onChange,
  onDelete,
}: {
  menuLink: DirectoryCoreMenuLink
  index: number
  onChange: (index: number, menuLink: DirectoryCoreMenuLink) => void
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

  return (
    <div ref={setNodeRef} style={style}>
      <MenuLinkFields
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Reorder ${menuLink.label || "menu link"}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
        menuLink={menuLink}
        index={index}
        onChange={onChange}
        onDelete={onDelete}
      />
    </div>
  )
}

function StaticMenuLinkItem({
  menuLink,
  index,
  onChange,
  onDelete,
}: {
  menuLink: DirectoryCoreMenuLink
  index: number
  onChange: (index: number, menuLink: DirectoryCoreMenuLink) => void
  onDelete: (index: number) => void
}) {
  return (
    <MenuLinkFields
      dragHandle={
        <div className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      }
      menuLink={menuLink}
      index={index}
      onChange={onChange}
      onDelete={onDelete}
    />
  )
}

function MenuAddLinkButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="h-8 w-fit justify-self-start gap-2 px-3 shadow-none">
      <Plus className="h-4 w-4" />
      Add Link
    </Button>
  )
}

export function DirectoryCoreBlock({
  content,
  onContentChange,
  siteId,
  directoryTitle,
  directoryFeaturedImage,
  onDirectoryTitleChange,
  onDirectoryFeaturedImageChange,
  showDirectoryTitleField = true,
}: DirectoryCoreBlockProps) {
  const [showImagePicker, setShowImagePicker] = useState(false)
  const [sortableReady, setSortableReady] = useState(false)

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
  const featuredImage = directoryFeaturedImage || ""
  const address = typeof content.address === "string" ? content.address : ""
  const rating = typeof content.rating === "number" || typeof content.rating === "string" ? String(content.rating) : ""

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

  const addSocialLink = () => {
    onContentChange("socialLinks", [
      ...socialLinks,
      {
        id: createCoreItemId("social"),
        platform: SOCIAL_PLATFORM_OPTIONS[0].value,
        url: "",
      },
    ])
  }

  const removeSocialLink = (index: number) => {
    onContentChange(
      "socialLinks",
      socialLinks.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const updateSocialLink = (index: number, socialLink: DirectoryCoreSocialLink) => {
    onContentChange(
      "socialLinks",
      socialLinks.map((link, itemIndex) => (itemIndex === index ? socialLink : link))
    )
  }

  const handleSocialLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = socialLinks.findIndex((link) => link.id === active.id)
    const newIndex = socialLinks.findIndex((link) => link.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onContentChange("socialLinks", arrayMove(socialLinks, oldIndex, newIndex))
  }

  const addMenuLink = () => {
    onContentChange("menuLinks", [
      ...menuLinks,
      {
        id: createCoreItemId("menu"),
        type: "directions",
        label: "",
        value: "",
      },
    ])
  }

  const removeMenuLink = (index: number) => {
    onContentChange(
      "menuLinks",
      menuLinks.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const updateMenuLink = (index: number, menuLink: DirectoryCoreMenuLink) => {
    const nextMenuLinks = menuLinks.map((link, itemIndex) => (itemIndex === index ? menuLink : link))

    onContentChange(
      "menuLinks",
      nextMenuLinks.filter((link, itemIndex, links) =>
        link.type !== "claim" || links.findIndex((item) => item.type === "claim") === itemIndex
      )
    )
  }

  const handleMenuLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = menuLinks.findIndex((link) => link.id === active.id)
    const newIndex = menuLinks.findIndex((link) => link.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onContentChange("menuLinks", arrayMove(menuLinks, oldIndex, newIndex))
  }

  const addressRatingFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="directory-core-address">Address</FieldLabel>
        <Input
          id="directory-core-address"
          value={address}
          onChange={(event) => onContentChange("address", event.target.value)}
          placeholder="175 Bloor St E, Toronto, ON"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="directory-core-rating">Rating</FieldLabel>
        <Input
          id="directory-core-rating"
          type="number"
          min="0"
          max="5"
          step="0.1"
          value={rating}
          onChange={(event) => {
            const value = event.target.value
            onContentChange("rating", value === "" ? "" : Number(value))
          }}
          placeholder="4.3"
        />
      </Field>
    </div>
  )

  const socialLinksEditor = socialLinks.length === 0 ? (
    <div className="grid gap-3">
      <div className="rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
        No social links.
      </div>
      <MenuAddLinkButton onClick={addSocialLink} />
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
        <div className="grid gap-3">
          {socialLinks.map((socialLink, index) => (
            <SortableSocialLinkItem
              key={socialLink.id}
              socialLink={socialLink}
              index={index}
              onChange={updateSocialLink}
              onDelete={removeSocialLink}
            />
          ))}
          <MenuAddLinkButton onClick={addSocialLink} />
        </div>
      </SortableContext>
    </DndContext>
  ) : (
    <div className="grid gap-3">
      {socialLinks.map((socialLink, index) => (
        <StaticSocialLinkItem
          key={socialLink.id || `social-link-static-${index}`}
          socialLink={socialLink}
          index={index}
          onChange={updateSocialLink}
          onDelete={removeSocialLink}
        />
      ))}
      <MenuAddLinkButton onClick={addSocialLink} />
    </div>
  )

  const menuLinksEditor = menuLinks.length === 0 ? (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
        No menu links.
      </div>
      <MenuAddLinkButton onClick={addMenuLink} />
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
        <div className="grid gap-3">
          {menuLinks.map((menuLink, index) => (
            <SortableMenuLinkItem
              key={menuLink.id}
              menuLink={menuLink}
              index={index}
              onChange={updateMenuLink}
              onDelete={removeMenuLink}
            />
          ))}
          <MenuAddLinkButton onClick={addMenuLink} />
        </div>
      </SortableContext>
    </DndContext>
  ) : (
    <div className="grid gap-3">
      {menuLinks.map((menuLink, index) => (
        <StaticMenuLinkItem
          key={menuLink.id || `menu-link-static-${index}`}
          menuLink={menuLink}
          index={index}
          onChange={updateMenuLink}
          onDelete={removeMenuLink}
        />
      ))}
      <MenuAddLinkButton onClick={addMenuLink} />
    </div>
  )

  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Directory Details</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          {showDirectoryTitleField ? (
            <>
              <Field>
                <FieldLabel htmlFor="directory-core-title">Title</FieldLabel>
                <Input
                  id="directory-core-title"
                  value={directoryTitle || ""}
                  onChange={(event) => onDirectoryTitleChange?.(event.target.value)}
                  placeholder="Directory title"
                  className="text-lg font-medium"
                />
              </Field>

              <div className="space-y-3">
                <p className="text-sm font-medium">Featured Image</p>
                {featuredImage ? (
                  <div className="relative h-48 w-48 overflow-hidden rounded-lg bg-muted">
                    <img
                      src={featuredImage}
                      alt="Featured image preview"
                      className="h-full w-full object-contain"
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
                    className="flex h-48 w-48 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/50 transition-all hover:border-muted-foreground/40 hover:bg-muted/70"
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

              {addressRatingFields}
            </>
          ) : (
            <>
              <BlockEditorEmptyState>
                Title and featured image come from each real directory item.
              </BlockEditorEmptyState>

              {addressRatingFields}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Social Links</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>{socialLinksEditor}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Menu Links</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>{menuLinksEditor}</CardContent>
      </Card>
    </CardGroup>
  )
}
