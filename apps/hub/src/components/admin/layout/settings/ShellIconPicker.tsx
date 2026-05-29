"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Check, ImageIcon, Loader2, Search, Upload } from "lucide-react"

import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { getPaginatedMediaAction, type MediaData, type PaginatedMediaResponse } from "@/lib/actions/media/media-actions"
import { cn } from "@/lib/utils/tailwind"
import {
  QUICK_LINK_ICON_OPTIONS,
  getQuickLinkIcon,
  isQuickLinkIconUrl,
  renderQuickLinkIcon,
  type QuickLinkIconValue
} from "@/lib/utils/site-quick-links"

export function ShellIconPreview({ icon, className }: { icon?: QuickLinkIconValue; className?: string }) {
  return renderQuickLinkIcon(icon, className)
}

function ShellIconSelectedMark() {
  return (
    <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
      <Check className="h-3 w-3" />
    </span>
  )
}

export function ShellIconPickerField({
  value,
  onChange,
  siteId,
  compact = false,
  allowEmpty = true
}: {
  value?: QuickLinkIconValue
  onChange: (value?: QuickLinkIconValue) => void
  siteId: string
  compact?: boolean
  allowEmpty?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"lucide" | "media">("lucide")
  const [query, setQuery] = useState("")
  const [mediaData, setMediaData] = useState<PaginatedMediaResponse | null>(null)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<MediaData | null>(null)
  const [mediaPage, setMediaPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const DefaultIcon = getQuickLinkIcon()
  const selectedMediaUrl = isQuickLinkIconUrl(value) ? value : undefined
  const normalizedQuery = query.trim().toLowerCase()
  const showDefaultOption = allowEmpty && (!normalizedQuery || "default icon".includes(normalizedQuery))
  const currentLabel = value
    ? QUICK_LINK_ICON_OPTIONS.find((option) => option.value === value)?.label || "Media icon"
    : "No icon"

  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return QUICK_LINK_ICON_OPTIONS

    return QUICK_LINK_ICON_OPTIONS.filter((option) => {
      const haystack = [option.label, option.value, ...(option.keywords || [])].join(" ").toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [normalizedQuery])

  const mediaItems = useMemo(() => {
    return (mediaData?.data ?? [])
      .filter((media) => {
        if (!normalizedQuery) return true
        return `${media.original_name} ${media.alt_text ?? ""}`.toLowerCase().includes(normalizedQuery)
      })
      .sort((left, right) => {
        if (selectedMediaUrl && getMediaIconUrl(left) === selectedMediaUrl) return -1
        if (selectedMediaUrl && getMediaIconUrl(right) === selectedMediaUrl) return 1
        return 0
      })
  }, [mediaData?.data, normalizedQuery, selectedMediaUrl])

  const resetPicker = useCallback(() => {
    setActiveTab("lucide")
    setQuery("")
    setMediaError(null)
    setSelectedMedia(null)
    setMediaPage(1)
  }, [])

  const closePicker = useCallback(() => {
    setOpen(false)
    resetPicker()
  }, [resetPicker])

  const loadMedia = useCallback(async () => {
    setMediaLoading(true)
    setMediaError(null)
    try {
      const { data, error } = await getPaginatedMediaAction(mediaPage, 12, "image", siteId, "image/svg+xml")
      if (error) {
        setMediaError(error)
        return
      }
      setMediaData(data)
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Failed to load media")
    } finally {
      setMediaLoading(false)
    }
  }, [mediaPage, siteId])

  useEffect(() => {
    if (open && activeTab === "media") {
      loadMedia()
    }
  }, [activeTab, loadMedia, open])

  useEffect(() => {
    if (!open || selectedMedia || !selectedMediaUrl) return
    const currentMedia = mediaItems.find((media) => getMediaIconUrl(media) === selectedMediaUrl)
    if (currentMedia) setSelectedMedia(currentMedia)
  }, [mediaItems, open, selectedMedia, selectedMediaUrl])

  async function handleSvgUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.type !== "image/svg+xml") {
      setMediaError("Invalid file type. Only SVG files are allowed.")
      return
    }

    setUploading(true)
    setMediaError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("siteId", siteId)

      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Upload failed")
      }

      onChange(getMediaIconUrl(result.data))
      closePicker()
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon-sm" : "default"}
      className={cn(compact ? "h-8 w-8" : "h-9 w-9 shrink-0 p-0 shadow-none hover:bg-muted/50")}
      onClick={() => setOpen(true)}
      aria-label={`Choose icon, current icon ${currentLabel}`}
      title={currentLabel}
    >
      <ShellIconPreview icon={value} className="h-4 w-4 shrink-0" />
      {!value ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-md border border-dashed bg-muted text-muted-foreground",
            compact ? "h-7 w-7" : "h-9 w-9"
          )}
        >
          <ImageIcon className="h-4 w-4" />
        </span>
      ) : null}
    </Button>
  )

  return (
    <>
      {compact ? (
        trigger
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">Icon</p>
          {trigger}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) {
            resetPicker()
          }
        }}
      >
        <DashboardModalContent
          className="max-h-none max-w-2xl overflow-visible"
          title="Choose Icon"
          titleAccessory={
            <div className="inline-flex h-9 items-center gap-1 rounded-md bg-muted p-1 text-muted-foreground">
              <button
                type="button"
                onClick={() => setActiveTab("lucide")}
                className={cn(
                  "inline-flex h-7 items-center justify-center rounded-sm px-3 text-sm font-medium transition-all hover:bg-background/50",
                  activeTab === "lucide" && "bg-background text-foreground shadow-sm"
                )}
                aria-pressed={activeTab === "lucide"}
              >
                Lucide
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("media")}
                className={cn(
                  "inline-flex h-7 items-center justify-center rounded-sm px-3 text-sm font-medium transition-all hover:bg-background/50",
                  activeTab === "media" && "bg-background text-foreground shadow-sm"
                )}
                aria-pressed={activeTab === "media"}
              >
                Media Library
              </button>
            </div>
          }
          bodyClassName="overflow-visible"
          viewportClassName="gap-4 pt-5"
          footer={
            <>
              {allowEmpty && value ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onChange(undefined)
                    closePicker()
                  }}
                >
                  Remove Icon
                </Button>
              ) : null}
              {activeTab === "media" ? (
                <Button
                  type="button"
                  disabled={!selectedMedia}
                  onClick={() => {
                    if (!selectedMedia) return
                    onChange(getMediaIconUrl(selectedMedia))
                    closePicker()
                  }}
                >
                  Select
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={closePicker}>
                Back
              </Button>
            </>
          }
        >
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="pl-9"
                placeholder={activeTab === "media" ? "Search SVGs" : "Search icons"}
              />
            </div>
            {activeTab === "media" ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/svg+xml,.svg"
                  onChange={handleSvgUpload}
                />
                <Button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={uploading ? "Uploading SVG" : "Upload SVG"}
                  className="shrink-0 px-3 sm:px-4"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  <span className="hidden sm:inline">{uploading ? "Uploading" : "Upload SVG"}</span>
                </Button>
              </>
            ) : null}
          </div>

          {activeTab === "lucide" ? (
            <ScrollArea className="pr-2">
              {filteredOptions.length === 0 && !showDefaultOption ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No icons match that search.</div>
              ) : (
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                  {showDefaultOption ? (
                    <button
                      type="button"
                      onClick={() => {
                        onChange(undefined)
                        closePicker()
                      }}
                      className={cn(
                        "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
                        !value && "bg-primary/5"
                      )}
                      aria-label="Use default icon"
                    >
                      {!value ? <ShellIconSelectedMark /> : null}
                      <DefaultIcon className="h-5 w-5" />
                      <span className="line-clamp-2 text-[11px] leading-tight">Default</span>
                    </button>
                  ) : null}
                  {filteredOptions.map((option) => {
                    const Icon = getQuickLinkIcon(option.value)
                    const isSelected = option.value === value

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onChange(option.value)
                          closePicker()
                        }}
                        className={cn(
                          "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
                          isSelected && "bg-primary/5"
                        )}
                        aria-label={`Choose ${option.label} icon`}
                      >
                        {isSelected ? <ShellIconSelectedMark /> : null}
                        <Icon className="h-5 w-5" />
                        <span className="line-clamp-2 text-[11px] leading-tight">{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          ) : (
            <div className="space-y-3">
              {mediaError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {mediaError}
                </div>
              ) : null}
              <ScrollArea className="pr-2">
                {mediaLoading ? (
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                    {Array.from({ length: 14 }).map((_, index) => (
                      <Skeleton key={index} className="aspect-square rounded-lg" />
                    ))}
                  </div>
                ) : mediaItems.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <ImageIcon className="mx-auto mb-3 h-10 w-10" />
                    <p>No SVG files found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                    {mediaItems.map((media) => {
                      const isSelected = selectedMedia?.id === media.id

                      return (
                        <button
                          key={media.id}
                          type="button"
                          className={cn(
                            "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
                            isSelected && "bg-primary/5"
                          )}
                          onClick={() => setSelectedMedia(media)}
                          aria-label={`Choose ${media.original_name} icon`}
                        >
                          {isSelected ? <ShellIconSelectedMark /> : null}
                          {renderQuickLinkIcon(media.public_url, "h-5 w-5")}
                          <span className="line-clamp-2 text-[11px] leading-tight">{media.original_name}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>

              {mediaData && mediaData.totalPages > 1 ? (
                <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span>
                    Page {mediaData.page} of {mediaData.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mediaPage <= 1}
                      onClick={() => setMediaPage(Math.max(1, mediaPage - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mediaPage >= mediaData.totalPages}
                      onClick={() => setMediaPage(mediaPage + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </DashboardModalContent>
      </Dialog>
    </>
  )
}

function getMediaIconUrl(media: Pick<MediaData, "storage_path">) {
  return `/cdn/${media.storage_path.replace(/^\/+/, "")}`
}
