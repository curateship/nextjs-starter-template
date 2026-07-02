"use client"

import { useEffect, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { BlockEditorEmptyState } from "@/components/ui/tabs"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
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
} from "@dnd-kit/sortable"
import {
  ImageIcon,
  X,
} from "lucide-react"
import {
  normalizeDirectoryCoreMenuLink,
  normalizeDirectoryCoreSocialLink,
  type DirectoryCoreMenuLink,
  type DirectoryCoreSocialLink,
} from "@/lib/actions/directories/directory-core"
import {
  createCoreItemId,
  MenuAddLinkButton,
  SOCIAL_PLATFORM_OPTIONS,
  SortableMenuLinkItem,
  SortableSocialLinkItem,
  StaticMenuLinkItem,
  StaticSocialLinkItem,
} from "@/components/admin/directory-builder/blocks/core/DirectoryCoreLinkItems"

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
