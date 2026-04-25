"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog } from "@/components/ui/dialog"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalDescription,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
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
import {
  ArrowLeft,
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
} from "lucide-react"

interface FooterLink {
  text: string
  url: string
  id?: string
}

interface SocialLink {
  platform: string
  url: string
  id?: string
}

interface FooterBlockProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onContentPersist?: (nextContent: Record<string, any>) => Promise<boolean>
  siteFavicon?: string
  siteName?: string
  onBack?: () => void
}

const ACTION_BUTTON_CLASS =
  "h-9 w-9 shrink-0 rounded-md p-0 text-foreground hover:bg-muted/50"

const SOCIAL_PLATFORM_OPTIONS = [
  { value: "twitter", label: "Twitter", Icon: Twitter },
  { value: "facebook", label: "Facebook", Icon: Facebook },
  { value: "instagram", label: "Instagram", Icon: Instagram },
  { value: "linkedin", label: "LinkedIn", Icon: Linkedin },
  { value: "youtube", label: "YouTube", Icon: Youtube },
  { value: "tiktok", label: "TikTok", Icon: Music2 },
  { value: "github", label: "GitHub", Icon: Github },
] as const

function createFooterItemId(prefix: "link" | "social") {
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
  if (option) {
    return { label: option.label, Icon: option.Icon }
  }

  if (!platform) {
    return { label: "Social Link", Icon: Globe }
  }

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

function SortableFooterLinkItem({
  link,
  index,
  onEdit,
  onDelete,
}: {
  link: FooterLink
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
  } = useSortable({ id: link.id! })

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
          aria-label={`Reorder ${link.text || "footer link"}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onEdit(index)}
          className="h-9 max-w-[220px] justify-start px-3 text-sm font-medium"
          aria-label={`Edit settings for ${link.text || "footer link"}`}
          title={link.text || "Footer link settings"}
        >
          <span className="truncate">{link.text || "Link"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={`${ACTION_BUTTON_CLASS} hover:bg-red-50`}
          aria-label={`Delete ${link.text || "footer link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function StaticFooterLinkItem({
  link,
  index,
  onEdit,
  onDelete,
}: {
  link: FooterLink
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
          className="h-9 max-w-[220px] justify-start px-3 text-sm font-medium"
          aria-label={`Edit settings for ${link.text || "footer link"}`}
          title={link.text || "Footer link settings"}
        >
          <span className="truncate">{link.text || "Link"}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={`${ACTION_BUTTON_CLASS} hover:bg-red-50`}
          aria-label={`Delete ${link.text || "footer link"}`}
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
  onEdit,
  onDelete,
}: {
  socialLink: SocialLink
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
          className={`${ACTION_BUTTON_CLASS} hover:bg-red-50`}
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
  socialLink: SocialLink
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
          className={`${ACTION_BUTTON_CLASS} hover:bg-red-50`}
          aria-label={`Delete ${socialLink.platform || "social link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function PageFooterBlock({
  content,
  onContentChange,
  onContentPersist,
  siteFavicon,
  siteName = "Your Site",
  onBack,
}: FooterBlockProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [sortableReady, setSortableReady] = useState(false)
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null)
  const [editingSocialLinkIndex, setEditingSocialLinkIndex] = useState<number | null>(null)
  const [creatingSocialLink, setCreatingSocialLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState<Pick<FooterLink, "text" | "url">>({
    text: "",
    url: "",
  })
  const [socialLinkDraft, setSocialLinkDraft] = useState<SocialLink>({
    platform: SOCIAL_PLATFORM_OPTIONS[0].value,
    url: "",
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
  const links = useMemo<FooterLink[]>(
    () => (Array.isArray(content.links) ? content.links : []),
    [content.links]
  )
  const socialLinks = useMemo<SocialLink[]>(
    () => (Array.isArray(content.socialLinks) ? content.socialLinks : []),
    [content.socialLinks]
  )
  const defaultCopyrightText = `© {year} ${siteName}. All rights reserved.`
  const copyrightText =
    typeof content.copyright === "string"
      ? content.copyright
      : defaultCopyrightText
  const sortableLinksReady = sortableReady && links.every((link) => !!link.id)
  const sortableSocialLinksReady =
    sortableReady && socialLinks.every((socialLink) => !!socialLink.id)

  useEffect(() => {
    setSortableReady(true)
  }, [])

  useEffect(() => {
    if (!links.some((link) => !link.id)) return

    onContentChange(
      "links",
      links.map((link) => ({
        ...link,
        id: link.id || createFooterItemId("link"),
      }))
    )
  }, [links, onContentChange])

  useEffect(() => {
    if (!socialLinks.some((socialLink) => !socialLink.id)) return

    onContentChange(
      "socialLinks",
      socialLinks.map((socialLink) => ({
        ...socialLink,
        id: socialLink.id || createFooterItemId("social"),
      }))
    )
  }, [socialLinks, onContentChange])

  const addLink = () => {
    onContentChange("links", [
      ...links,
      {
        text: "",
        url: "",
        id: createFooterItemId("link"),
      },
    ])
  }

  const openLinkEditor = (index: number) => {
    const link = links[index]
    if (!link) return

    setLinkDraft({
      text: link.text,
      url: link.url,
    })
    setEditingLinkIndex(index)
  }

  const removeLink = (index: number) => {
    onContentChange("links", links.filter((_, itemIndex) => itemIndex !== index))
  }

  const saveLinkEditor = () => {
    if (editingLinkIndex === null) return

    const previousLinks = links
    const nextLinks = [...links]
    nextLinks[editingLinkIndex] = {
      ...nextLinks[editingLinkIndex],
      text: linkDraft.text,
      url: linkDraft.url.trim(),
    }

    const nextContent = { ...content, links: nextLinks }

    if (!onContentPersist) {
      onContentChange("links", nextLinks)
      setEditingLinkIndex(null)
      return
    }

    onContentChange("links", nextLinks)
    setModalSaving(true)
    void onContentPersist(nextContent)
      .then((success) => {
        if (success) {
          setEditingLinkIndex(null)
        } else {
          onContentChange("links", previousLinks)
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

  const addSocialLink = () => {
    setSocialLinkDraft({
      platform: SOCIAL_PLATFORM_OPTIONS[0].value,
      url: "",
    })
    setCreatingSocialLink(true)
  }

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

  const removeSocialLink = (index: number) => {
    onContentChange(
      "socialLinks",
      socialLinks.filter((_, itemIndex) => itemIndex !== index)
    )
  }

  const saveSocialLinkEditor = () => {
    const previousSocialLinks = socialLinks
    const nextSocialLinks = creatingSocialLink
      ? [
          ...socialLinks,
          {
            ...socialLinkDraft,
            url: socialLinkDraft.url.trim(),
            id: createFooterItemId("social"),
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

    const nextContent = { ...content, socialLinks: nextSocialLinks }

    if (!onContentPersist) {
      onContentChange("socialLinks", nextSocialLinks)
      setCreatingSocialLink(false)
      setEditingSocialLinkIndex(null)
      return
    }

    onContentChange("socialLinks", nextSocialLinks)
    setModalSaving(true)
    void onContentPersist(nextContent)
      .then((success) => {
        if (success) {
          setCreatingSocialLink(false)
          setEditingSocialLinkIndex(null)
        } else {
          onContentChange("socialLinks", previousSocialLinks)
        }
      })
      .finally(() => {
        setModalSaving(false)
      })
  }

  const handleSocialLinkDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = socialLinks.findIndex((socialLink) => socialLink.id === active.id)
    const newIndex = socialLinks.findIndex((socialLink) => socialLink.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return
    onContentChange("socialLinks", arrayMove(socialLinks, oldIndex, newIndex))
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
          <Card className="shadow-sm">
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Settings</h2>
            </CardHeader>
            <CardContent className="space-y-6">
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
                          <ImageIcon className="mx-auto h-4 w-4 text-muted-foreground/50" />
                          <p className="mt-1 text-xs text-muted-foreground">Click to select</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <Input
                      id="footerLogoUrl"
                      value={logoUrl}
                      onChange={(event) => onContentChange("logoUrl", event.target.value)}
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

              <div className="space-y-2">
                <Label className="px-1 text-sm font-medium">Copyright</Label>
                <Input
                  value={copyrightText}
                  onChange={(event) => onContentChange("copyright", event.target.value)}
                  placeholder={defaultCopyrightText}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Footer Links</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {links.length === 0 ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground">
                    No footer links.
                  </div>
                  <button
                    type="button"
                    onClick={addLink}
                    className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border bg-background transition-colors hover:border-muted-foreground/50 hover:bg-accent"
                    aria-label="Add footer link"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : sortableLinksReady ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleLinkDragEnd}
                >
                  <SortableContext
                    items={links.map((link) => link.id!)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {links.map((link, index) => (
                        <SortableFooterLinkItem
                          key={link.id}
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
                        aria-label="Add footer link"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {links.map((link, index) => (
                    <StaticFooterLinkItem
                      key={link.id || `footer-link-static-${index}`}
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
                    aria-label="Add footer link"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Social Links</h2>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    items={socialLinks.map((socialLink) => socialLink.id!)}
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
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Footer Link Settings</AdminModalTitle>
            <AdminModalDescription>
              Update the label and destination URL for this footer link.
            </AdminModalDescription>
          </AdminModalHeader>

          <AdminModalBody className="space-y-6 pb-6">
            <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)] md:items-end">
              <div className="space-y-2">
                <p className="text-sm font-medium">Name</p>
                <Input
                  value={linkDraft.text}
                  onChange={(event) =>
                    setLinkDraft((prev) => ({ ...prev, text: event.target.value }))
                  }
                  placeholder="Label"
                  aria-label="Footer link name"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">URL</p>
                <Input
                  value={linkDraft.url}
                  onChange={(event) =>
                    setLinkDraft((prev) => ({ ...prev, url: event.target.value }))
                  }
                  placeholder="/about or https://example.com"
                  aria-label="Footer link URL"
                />
              </div>
            </div>
          </AdminModalBody>

          <AdminModalFooter className="sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setEditingLinkIndex(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={modalSaving} onClick={saveLinkEditor}>
              {modalSaving ? "Saving..." : "Save"}
            </Button>
          </AdminModalFooter>
        </AdminModalContent>
      </Dialog>

      <Dialog
        open={editingSocialLinkIndex !== null || creatingSocialLink}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCreatingSocialLink(false)
            setEditingSocialLinkIndex(null)
          }
        }}
      >
        <AdminModalContent>
          <AdminModalHeader>
            <AdminModalTitle>Social Link Settings</AdminModalTitle>
            <AdminModalDescription>
              Update the platform and destination URL for this social link.
            </AdminModalDescription>
          </AdminModalHeader>

          <AdminModalBody className="space-y-6 pb-6">
            <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)] md:items-end">
              <div className="space-y-2">
                <p className="text-sm font-medium">Platform</p>
                <Select
                  value={socialLinkDraft.platform || SOCIAL_PLATFORM_OPTIONS[0].value}
                  onValueChange={(value) =>
                    setSocialLinkDraft((prev) => ({ ...prev, platform: value }))
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
                    setSocialLinkDraft((prev) => ({ ...prev, url: event.target.value }))
                  }
                  placeholder="https://twitter.com/example"
                  aria-label="Social link URL"
                />
              </div>
            </div>
          </AdminModalBody>

          <AdminModalFooter className="sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingSocialLinkIndex(null)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={modalSaving} onClick={saveSocialLinkEditor}>
              {modalSaving ? "Saving..." : "Save"}
            </Button>
          </AdminModalFooter>
        </AdminModalContent>
      </Dialog>
    </>
  )
}
