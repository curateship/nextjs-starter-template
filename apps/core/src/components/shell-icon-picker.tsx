import * as React from "react"
import {
  CheckIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getMediaErrorMessage,
  listMedia,
  uploadMedia,
  type MediaItem,
  type MediaListResponse,
} from "@/lib/api/media"
import {
  getShellIconLabel,
  iconMeta,
  normalizeDynamicLucideIconName,
  renderShellIcon,
  type IconKey,
  type ShellIcon,
} from "@/lib/core"
import { cn } from "@/lib/utils"

const iconOptions = Object.entries(iconMeta).map(([value, meta]) => ({
  value: value as IconKey,
  label: meta.label,
}))
const svgMimeType = "image/svg+xml"
const mediaPageSize = 12

type IconPickerTab = "lucide" | "media"

function getMediaIconUrl(item: MediaItem) {
  return `/api/v1/media/${item.id}/file`
}

export function ShellIconPicker({
  value,
  onValueChange,
  allowEmpty = false,
  compact = false,
  ghost = false,
}: {
  value?: ShellIcon
  onValueChange: (value: ShellIcon | undefined) => void
  allowEmpty?: boolean
  compact?: boolean
  ghost?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<IconPickerTab>("lucide")
  const [query, setQuery] = React.useState("")
  const [mediaData, setMediaData] = React.useState<MediaListResponse | null>(null)
  const [mediaLoading, setMediaLoading] = React.useState(false)
  const [mediaError, setMediaError] = React.useState<string | null>(null)
  const [selectedMedia, setSelectedMedia] = React.useState<MediaItem | null>(null)
  const [mediaPage, setMediaPage] = React.useState(1)
  const [uploading, setUploading] = React.useState(false)
  const [customIconOpen, setCustomIconOpen] = React.useState(false)
  const [customIconName, setCustomIconName] = React.useState("")
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const currentLabel = getShellIconLabel(value)
  const normalizedQuery = query.trim().toLowerCase()
  const customLucideIcon = normalizeDynamicLucideIconName(customIconName)
  const customIconError =
    customIconName.trim() && !customLucideIcon
      ? "No Lucide icon found with that name."
      : null

  const filteredIcons = React.useMemo(() => {
    if (!normalizedQuery) return iconOptions
    return iconOptions.filter((option) =>
      `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery)
    )
  }, [normalizedQuery])

  const mediaItems = React.useMemo(() => {
    return (mediaData?.media ?? [])
      .filter((item) => {
        if (!normalizedQuery) return true
        return `${item.original_name} ${item.filename} ${item.alt_text ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery)
      })
      .sort((left, right) => {
        if (value && getMediaIconUrl(left) === value) return -1
        if (value && getMediaIconUrl(right) === value) return 1
        return 0
      })
  }, [mediaData?.media, normalizedQuery, value])

  const loadMedia = React.useCallback(async () => {
    setMediaLoading(true)
    setMediaError(null)
    try {
      setMediaData(
        await listMedia({
          page: mediaPage,
          pageSize: mediaPageSize,
          fileType: "image",
          mimeType: svgMimeType,
        })
      )
    } catch (error) {
      setMediaError(getMediaErrorMessage(error))
    } finally {
      setMediaLoading(false)
    }
  }, [mediaPage])

  React.useEffect(() => {
    if (open && activeTab === "media") {
      loadMedia()
    }
  }, [activeTab, loadMedia, open])

  React.useEffect(() => {
    if (!open || selectedMedia || !value) return
    const currentMedia = mediaItems.find((item) => getMediaIconUrl(item) === value)
    if (currentMedia) setSelectedMedia(currentMedia)
  }, [mediaItems, open, selectedMedia, value])

  function resetPicker() {
    setActiveTab("lucide")
    setQuery("")
    setMediaError(null)
    setSelectedMedia(null)
    setMediaPage(1)
    setCustomIconOpen(false)
    setCustomIconName("")
  }

  function closePicker() {
    setOpen(false)
    resetPicker()
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) resetPicker()
  }

  async function handleSvgUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    if (file.type !== svgMimeType) {
      setMediaError("Invalid file type. Only SVG files are allowed.")
      return
    }

    setUploading(true)
    setMediaError(null)
    try {
      const item = await uploadMedia(file)
      onValueChange(getMediaIconUrl(item))
      closePicker()
    } catch (error) {
      setMediaError(getMediaErrorMessage(error))
    } finally {
      setUploading(false)
    }
  }

  function handleCustomIconSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customLucideIcon) return
    onValueChange(customLucideIcon)
    closePicker()
  }

  return (
    <>
      <Button
        type="button"
        variant={ghost ? "ghost" : "outline"}
        size={compact ? "icon" : "default"}
        className={cn(
          !compact && "justify-start",
          !value &&
            "border-dotted border-muted-foreground/30 bg-muted/40 text-muted-foreground/50 hover:bg-muted/60"
        )}
        onClick={() => setOpen(true)}
        aria-label={`Choose icon, current icon ${currentLabel}`}
        title={currentLabel}
      >
        {value ? renderShellIcon(value, "h-4 w-4") : <ImageIcon className="h-4 w-4" />}
        {!compact ? <span className="truncate">{currentLabel}</span> : null}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          variant="admin"
          className="data-[variant=admin]:max-h-none data-[variant=admin]:overflow-visible sm:max-w-3xl"
        >
          <DialogHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-3 pr-8">
              <DialogTitle className="shrink-0">Choose Icon</DialogTitle>
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
            </div>
          </DialogHeader>

          <DialogBody className="gap-4 pt-7">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                  placeholder={activeTab === "media" ? "Search SVGs" : "Search icons"}
                />
              </div>
              {activeTab === "lucide" ? (
                <Popover open={customIconOpen} onOpenChange={setCustomIconOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Add Lucide icon"
                      title="Add Lucide icon"
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <PopoverHeader>
                      <PopoverTitle>Add Lucide Icon</PopoverTitle>
                    </PopoverHeader>
                    <form className="space-y-3" onSubmit={handleCustomIconSubmit}>
                      <Input
                        autoFocus
                        value={customIconName}
                        onChange={(event) => setCustomIconName(event.target.value)}
                        placeholder="octagon-x"
                      />
                      {customIconError ? (
                        <p className="text-xs text-destructive">{customIconError}</p>
                      ) : customLucideIcon ? (
                        <p className="text-xs text-muted-foreground">
                          Found {getShellIconLabel(customLucideIcon)}.
                        </p>
                      ) : null}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCustomIconOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={!customLucideIcon}>
                          Use Icon
                        </Button>
                      </div>
                    </form>
                  </PopoverContent>
                </Popover>
              ) : null}
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
                    variant="outline"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
                    {uploading ? "Uploading" : "Upload SVG"}
                  </Button>
                </>
              ) : null}
            </div>

            {activeTab === "lucide" ? (
              <LucideIconGrid
                value={value}
                icons={filteredIcons}
                allowEmpty={allowEmpty}
                onSelect={(icon) => {
                  onValueChange(icon)
                  closePicker()
                }}
              />
            ) : (
              <MediaIconGrid
                data={mediaData}
                error={mediaError}
                items={mediaItems}
                loading={mediaLoading}
                selectedMedia={selectedMedia}
                mediaPage={mediaPage}
                onSelectMedia={setSelectedMedia}
                onPageChange={setMediaPage}
              />
            )}
          </DialogBody>

          <DialogFooter variant="plain">
            {allowEmpty && value ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onValueChange(undefined)
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
                  onValueChange(getMediaIconUrl(selectedMedia))
                  closePicker()
                }}
              >
                Select
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={closePicker}>
              Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function LucideIconGrid({
  value,
  icons,
  allowEmpty,
  onSelect,
}: {
  value?: ShellIcon
  icons: { value: IconKey; label: string }[]
  allowEmpty: boolean
  onSelect: (icon: ShellIcon | undefined) => void
}) {
  if (!icons.length && !allowEmpty) {
    return <div className="py-10 text-center text-sm text-muted-foreground">No icons match that search.</div>
  }

  return (
    <ScrollArea className="pr-2">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
        {allowEmpty ? (
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            className={cn(
              "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
              !value && "bg-primary/5"
            )}
            aria-label="Use no icon"
          >
            {!value ? <SelectedMark /> : null}
            <ImageIcon className="h-5 w-5" />
            <span className="line-clamp-2 text-[11px] leading-tight">None</span>
          </button>
        ) : null}
        {icons.map((option) => {
          const isSelected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
                isSelected && "bg-primary/5"
              )}
              aria-label={`Choose ${option.label} icon`}
            >
              {isSelected ? <SelectedMark /> : null}
              {renderShellIcon(option.value, "h-5 w-5")}
              <span className="line-clamp-2 text-[11px] leading-tight">{option.label}</span>
            </button>
          )
        })}
      </div>
    </ScrollArea>
  )
}

function MediaIconGrid({
  data,
  error,
  items,
  loading,
  selectedMedia,
  mediaPage,
  onSelectMedia,
  onPageChange,
}: {
  data: MediaListResponse | null
  error: string | null
  items: MediaItem[]
  loading: boolean
  selectedMedia: MediaItem | null
  mediaPage: number
  onSelectMedia: (media: MediaItem) => void
  onPageChange: (page: number) => void
}) {
  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <ScrollArea className="pr-2">
        {loading ? (
          <div className="grid py-10 place-items-center text-sm text-muted-foreground">
            <Loader2Icon className="size-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <div>
              <ImageIcon className="mx-auto mb-3 size-10" />
              <p>No SVG files found.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
            {items.map((item) => {
              const isSelected = selectedMedia?.id === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg p-2 text-center transition-colors hover:bg-muted/50",
                    isSelected && "bg-primary/5"
                  )}
                  onClick={() => onSelectMedia(item)}
                  aria-label={`Choose ${item.original_name} icon`}
                >
                  {renderShellIcon(getMediaIconUrl(item), "h-5 w-5")}
                  {isSelected ? <SelectedMark /> : null}
                  <span className="line-clamp-2 text-[11px] leading-tight">
                    {item.original_name}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>

      {data && data.total_pages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            Page {data.page} of {data.total_pages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mediaPage <= 1}
              onClick={() => onPageChange(Math.max(1, mediaPage - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={mediaPage >= data.total_pages}
              onClick={() => onPageChange(mediaPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SelectedMark() {
  return (
    <span className="absolute top-2 right-2 rounded-full bg-primary p-0.5 text-primary-foreground">
      <CheckIcon className="h-3 w-3" />
    </span>
  )
}
