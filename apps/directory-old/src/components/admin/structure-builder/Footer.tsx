"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { MediaPicker } from "@/components/admin/media-library/MediaPicker"
import { DashboardModalContent, DashboardModalFormFooter } from "@/components/admin/layout/dashboard/modals"
import { LogoPickerPreview } from "@/components/admin/structure-builder/LogoPickerPreview"
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
} from "@dnd-kit/sortable"
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import {
  createFooterItemId,
  SOCIAL_PLATFORM_OPTIONS,
  SocialPlatformLabel,
  SortableFooterLinkItem,
  SortableSocialLinkItem,
  StaticFooterLinkItem,
  StaticSocialLinkItem,
  type FooterLink,
  type SocialLink,
} from "@/components/admin/structure-builder/FooterItems"

interface FooterProps {
  content: Record<string, any>
  onContentChange: (field: string, value: any) => void
  onContentPersist?: (nextContent: Record<string, any>) => Promise<boolean>
  siteFavicon?: string
  siteName?: string
  onBack?: () => void
}

export function Footer({
  content,
  onContentChange,
  onContentPersist,
  siteFavicon,
  onBack
}: FooterProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [sortableReady, setSortableReady] = useState(false)
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null)
  const [editingSocialLinkIndex, setEditingSocialLinkIndex] = useState<number | null>(null)
  const [creatingSocialLink, setCreatingSocialLink] = useState(false)
  const [linkDraft, setLinkDraft] = useState<Pick<FooterLink, "text" | "url">>({
    text: "",
    url: ""
  })
  const [socialLinkDraft, setSocialLinkDraft] = useState<SocialLink>({
    platform: SOCIAL_PLATFORM_OPTIONS[0].value,
    url: ""
  })
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
  const links = useMemo<FooterLink[]>(() => (Array.isArray(content.links) ? content.links : []), [content.links])
  const socialLinks = useMemo<SocialLink[]>(
    () => (Array.isArray(content.socialLinks) ? content.socialLinks : []),
    [content.socialLinks]
  )
  const defaultCopyrightText = `© {year} {site}. All rights reserved.`
  const copyrightText = typeof content.copyright === "string" ? content.copyright : defaultCopyrightText
  const sortableLinksReady = sortableReady && links.every((link) => !!link.id)
  const sortableSocialLinksReady = sortableReady && socialLinks.every((socialLink) => !!socialLink.id)

  useEffect(() => {
    setSortableReady(true)
  }, [])

  useEffect(() => {
    if (!links.some((link) => !link.id)) return

    onContentChange(
      "links",
      links.map((link) => ({
        ...link,
        id: link.id || createFooterItemId("link")
      }))
    )
  }, [links, onContentChange])

  useEffect(() => {
    if (!socialLinks.some((socialLink) => !socialLink.id)) return

    onContentChange(
      "socialLinks",
      socialLinks.map((socialLink) => ({
        ...socialLink,
        id: socialLink.id || createFooterItemId("social")
      }))
    )
  }, [socialLinks, onContentChange])

  const addLink = () => {
    onContentChange("links", [
      ...links,
      {
        text: "",
        url: "",
        id: createFooterItemId("link")
      }
    ])
  }

  const openLinkEditor = (index: number) => {
    const link = links[index]
    if (!link) return

    setLinkDraft({
      text: link.text,
      url: link.url
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

    const previousLinks = links
    const nextLinks = [...links]
    nextLinks[editingLinkIndex] = {
      ...nextLinks[editingLinkIndex],
      text: linkDraft.text,
      url: linkDraft.url.trim()
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
      url: ""
    })
    setCreatingSocialLink(true)
  }

  const openSocialLinkEditor = (index: number) => {
    const socialLink = socialLinks[index]
    if (!socialLink) return

    setCreatingSocialLink(false)
    setSocialLinkDraft({
      ...socialLink,
      platform: socialLink.platform || SOCIAL_PLATFORM_OPTIONS[0].value
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
            id: createFooterItemId("social")
          }
        ]
      : (() => {
          if (editingSocialLinkIndex === null) return socialLinks

          const nextItems = [...socialLinks]
          nextItems[editingSocialLinkIndex] = {
            ...(socialLinks[editingSocialLinkIndex] || {}),
            ...socialLinkDraft,
            url: socialLinkDraft.url.trim()
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
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold leading-none tracking-tight">Settings</h2>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-start">
                  <div className="shrink-0 pr-4">
                    <LogoPickerPreview logo={logo} siteFavicon={siteFavicon} onClick={() => setShowPicker(true)} />
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

              <Field>
                <FieldLabel>Copyright</FieldLabel>
                <Input
                  value={copyrightText}
                  onChange={(event) => onContentChange("copyright", event.target.value)}
                  placeholder={defaultCopyrightText}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
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
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLinkDragEnd}>
                  <SortableContext items={links.map((link) => link.id!)} strategy={horizontalListSortingStrategy}>
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

          <Card>
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
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSocialLinkDragEnd}>
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
        <DashboardModalContent
          busy={modalSaving}
          title="Footer Link Settings"
          description="Update the label and destination URL for this footer link."
          footer={<DashboardModalFormFooter busy={modalSaving} form="footer-link-editor-form" onCancel={() => setEditingLinkIndex(null)} submitLabel="Save" />}
        >
          <form
            noValidate
            id="footer-link-editor-form"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              saveLinkEditor()
            }}
          >
          <CardGroup className="grid">
            <Card>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_minmax(0,1fr)]">
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
                      aria-label="Footer link name"
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
                      aria-label="Footer link URL"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </CardGroup>
          </form>
        </DashboardModalContent>
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
        <DashboardModalContent
          busy={modalSaving}
          title="Social Link Settings"
          description="Update the platform and destination URL for this social link."
          footer={<DashboardModalFormFooter busy={modalSaving} form="footer-social-link-editor-form" onCancel={() => setEditingSocialLinkIndex(null)} submitLabel="Save" />}
        >
          <form
            noValidate
            id="footer-social-link-editor-form"
            className="contents"
            onSubmit={(event) => {
              event.preventDefault()
              saveSocialLinkEditor()
            }}
          >
          <CardGroup className="grid">
            <Card>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                  <Field>
                    <FieldLabel>Platform</FieldLabel>
                    <Select
                      value={socialLinkDraft.platform || SOCIAL_PLATFORM_OPTIONS[0].value}
                      onValueChange={(value) => setSocialLinkDraft((prev) => ({ ...prev, platform: value }))}
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
                  </Field>

                  <Field>
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      value={socialLinkDraft.url}
                      onChange={(event) =>
                        setSocialLinkDraft((prev) => ({
                          ...prev,
                          url: event.target.value
                        }))
                      }
                      placeholder="https://twitter.com/example"
                      aria-label="Social link URL"
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          </CardGroup>
          </form>
        </DashboardModalContent>
      </Dialog>
    </>
  )
}
