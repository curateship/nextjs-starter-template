import * as React from "react"
import { Link } from "@tanstack/react-router"
import { HistoryIcon, LanguagesIcon, Loader2Icon } from "lucide-react"

import { StaticSlidePreview } from "@/components/carousel-studio/slide-layer"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getCarouselErrorMessage,
  listCarouselVersions,
  restoreCarouselVersion,
  translateCarouselCopies,
  type CarouselItem,
  type CarouselVersionItem,
} from "@/lib/api/video/carousels"
import { formatDate } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"
import { VERSION_REASON_LABEL } from "@/lib/video/project-versions"
import {
  TRANSLATE_LANGUAGES,
  type TranslateLanguage,
} from "@/lib/video/translate"
import { cn } from "@/lib/utils"

const MOST_LANGUAGES = 10

/**
 * Copies in other languages (workspace/docs/carousel-writing.md): tick the
 * languages, and each becomes a new carousel with every text box translated.
 * The carousel open here is saved first and never changed.
 */
export function TranslateCopiesDialog({
  open,
  onOpenChange,
  carouselId,
  beforeTranslate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  carouselId: string
  /** Saves what is on screen, so the copies are made from it. */
  beforeTranslate: () => Promise<void>
}) {
  const [picked, setPicked] = React.useState<Set<TranslateLanguage>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [made, setMade] = React.useState<CarouselItem[] | null>(null)

  async function translate() {
    if (!picked.size) {
      showErrorToast("Tick at least one language.")
      return
    }
    setBusy(true)
    try {
      await beforeTranslate()
      const result = await translateCarouselCopies(carouselId, [...picked])
      setMade(result.made)
      if (result.failed.length) {
        showErrorToast(
          `${result.failed.map((item) => item.language).join(", ")} could not be made: ${result.failed[0].message}`
        )
      }
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  // Closing always starts the next opening afresh, with nothing ticked.
  function close() {
    if (busy) return
    setMade(null)
    setPicked(new Set())
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <DialogContent variant="admin" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Copies in other languages</DialogTitle>
          <DialogDescription>
            Each language you tick becomes a new carousel with every text box
            translated. This one stays as it is.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {made ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Made</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {made.length ? (
                  made.map((copy) => (
                    <Link
                      key={copy.id}
                      to="/admin/video-carousels/$carouselId"
                      params={{ carouselId: copy.id }}
                      className="text-sm font-medium underline"
                    >
                      {copy.name}
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No copies were made.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Translated words often run longer. A slide whose text no
                  longer fits is marked in its Slides list.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Languages</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-80">
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {TRANSLATE_LANGUAGES.map((language) => {
                      const id = `carousel-language-${language.replace(/\W+/g, "-")}`
                      const on = picked.has(language)
                      return (
                        <li key={language}>
                          <label htmlFor={id} className="flex items-center gap-3 text-sm">
                            <Checkbox
                              id={id}
                              checked={on}
                              onCheckedChange={(checked) => {
                                if (checked === true && picked.size >= MOST_LANGUAGES) {
                                  showErrorToast(
                                    `Pick up to ${MOST_LANGUAGES} languages at once.`
                                  )
                                  return
                                }
                                setPicked((current) => {
                                  const next = new Set(current)
                                  if (checked === true) next.add(language)
                                  else next.delete(language)
                                  return next
                                })
                              }}
                            />
                            {language}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </DialogBody>
        <DialogFooter>
          {made ? (
            <Button type="button" onClick={close}>
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={() => void translate()}>
                {busy ? <Loader2Icon className="animate-spin" /> : <LanguagesIcon />}
                {busy
                  ? "Translating"
                  : picked.size
                    ? `Make ${picked.size} ${picked.size === 1 ? "copy" : "copies"}`
                    : "Make copies"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Earlier versions (workspace/docs/carousel-history.md): the slides as they
 * were before a break, every hour of editing and before each restore. One
 * can be looked at and brought back; what is there now is kept first.
 */
export function CarouselVersionsDialog({
  open,
  onOpenChange,
  carouselId,
  beforeRestore,
  onRestored,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  carouselId: string
  beforeRestore: () => Promise<void>
  onRestored: () => void
}) {
  const [versions, setVersions] = React.useState<CarouselVersionItem[] | null>(null)
  const [pickedId, setPickedId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let active = true
    listCarouselVersions(carouselId)
      .then((loaded) => {
        if (active) setVersions(loaded)
      })
      .catch((error) => {
        if (!active) return
        setVersions([])
        showErrorToast(getCarouselErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [carouselId, open])

  const picked = versions?.find((version) => version.id === pickedId) ?? versions?.[0]

  async function restore() {
    if (!picked) {
      showErrorToast("There is no earlier version to bring back yet.")
      return
    }
    setBusy(true)
    try {
      await beforeRestore()
      await restoreCarouselVersion(carouselId, picked.id)
      onRestored()
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent variant="admin" className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Earlier versions</DialogTitle>
          <DialogDescription>
            Kept when you come back after half an hour, every hour you edit,
            and before each restore. Bringing one back keeps what is here now.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {versions === null ? (
            <LoadingRow label="Loading versions" />
          ) : !versions.length ? (
            <p className="text-sm text-muted-foreground">
              No earlier versions yet. One is kept the next time you come back
              to this carousel after half an hour, and every hour you edit it.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <ul aria-label="Versions" className="grid content-start gap-1">
                {versions.map((version) => {
                  const on = version.id === picked?.id
                  return (
                    <li key={version.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPickedId(version.id)}
                        className={cn(
                          "grid w-full gap-0.5 rounded-md border p-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          on ? "border-primary bg-muted" : "border-transparent"
                        )}
                      >
                        <span className="font-medium">
                          {formatDate(version.saved_at)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {VERSION_REASON_LABEL[version.reason]} ·{" "}
                          {version.slide_count}{" "}
                          {version.slide_count === 1 ? "slide" : "slides"} ·{" "}
                          {version.format}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {picked ? (
                <ScrollArea className="max-h-[60vh]">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {picked.slides.map((slide, index) => (
                      <div key={slide.id} className="overflow-hidden rounded-md border">
                        <StaticSlidePreview
                          slide={slide}
                          format={picked.format}
                          index={index}
                          count={picked.slides.length}
                        />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : null}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void restore()}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : <HistoryIcon />}
            Bring this version back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
