import * as React from "react"
import {
  DownloadIcon,
  FileTextIcon,
  FilmIcon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { loadMusicShelf } from "@/lib/api/video/music"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  CAROUSEL_VIDEO_SECONDS,
  type CarouselVideoTransition,
} from "@/lib/video/carousel-schema"

/** What Export makes: the ZIP of slides, the PDF beside it, or a video. */
export type CarouselExportKind = "zip" | "pdf" | "video"

export type CarouselVideoOptions = {
  secondsPerSlide: number
  transition: CarouselVideoTransition
  music?: { mediaId: string; sourceDurationMs: number }
}

const TRANSITIONS: { id: CarouselVideoTransition; label: string }[] = [
  { id: "cut", label: "Cut" },
  { id: "fade", label: "Fade" },
  { id: "slide", label: "Slide" },
]

const NO_MUSIC = "none"

/**
 * The Export window (workspace/docs/carousel-exports.md,
 * workspace/docs/carousel-video.md): the slides as a ZIP, the same slides as
 * a PDF for LinkedIn, or a video made from them, plus the post caption, which
 * AI can write from the slides.
 */
export function CarouselExportDialog({
  open,
  onOpenChange,
  slideCount,
  videoSlides,
  caption,
  busy,
  writingCaption,
  error,
  onUpdateCaption,
  onWriteCaption,
  onExport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slideCount: number
  /** How many slides hold a clip; they come out as MP4s. */
  videoSlides: number
  caption: string
  busy: boolean
  writingCaption: boolean
  error: string | null
  onUpdateCaption: (caption: string) => void
  onWriteCaption: () => void
  onExport: (kind: CarouselExportKind, video: CarouselVideoOptions) => void
}) {
  const [kind, setKind] = React.useState<CarouselExportKind>("zip")
  const [seconds, setSeconds] = React.useState<number>(CAROUSEL_VIDEO_SECONDS.start)
  const [transition, setTransition] = React.useState<CarouselVideoTransition>("fade")
  const [musicId, setMusicId] = React.useState(NO_MUSIC)
  // Reading the music's length before the video is queued.
  const [measuring, setMeasuring] = React.useState(false)
  const [music, setMusic] = React.useState<
    { id: string; name: string; url: string }[] | null
  >(null)

  React.useEffect(() => {
    if (!open || kind !== "video" || music) return
    let active = true
    loadMusicShelf()
      .then((files) => {
        if (!active) return
        setMusic(
          files
            .filter((file) => file.is_music)
            .map((file) => ({ id: file.id, name: file.original_name, url: file.url }))
        )
      })
      .catch(() => {
        if (!active) return
        setMusic([])
        showErrorToast("Your music shelf could not be loaded, so only No music is offered.")
      })
    return () => {
      active = false
    }
  }, [kind, music, open])

  async function handleExport() {
    if (kind !== "video") {
      onExport(kind, { secondsPerSlide: seconds, transition })
      return
    }
    const track = music?.find((file) => file.id === musicId)
    if (!track) {
      onExport("video", { secondsPerSlide: seconds, transition })
      return
    }
    setMeasuring(true)
    const durationMs = await soundLength(track.url)
    setMeasuring(false)
    if (!durationMs) {
      showErrorToast(
        `${track.name} could not be read, so the video was not made. Pick another track or No music.`
      )
      return
    }
    onExport("video", {
      secondsPerSlide: seconds,
      transition,
      music: { mediaId: track.id, sourceDurationMs: durationMs },
    })
  }

  const working = busy || measuring

  const label =
    kind === "pdf" ? "Download PDF" : kind === "video" ? "Make the video" : "Export slides"
  const Icon = kind === "pdf" ? FileTextIcon : kind === "video" ? FilmIcon : DownloadIcon

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!working) onOpenChange(nextOpen)
      }}
    >
      <DialogContent variant="admin" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export carousel</DialogTitle>
          <DialogDescription>
            Every export is kept, the ZIP and the PDF in Carousel exports and a
            video in Exports, to download again or share by link.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Format</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Tabs value={kind} onValueChange={(value) => setKind(value as CarouselExportKind)}>
                <TabsList>
                  <TabsTrigger value="zip">Slides</TabsTrigger>
                  <TabsTrigger value="pdf">PDF for LinkedIn</TabsTrigger>
                  <TabsTrigger value="video">Video</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-sm text-muted-foreground">
                {kind === "zip"
                  ? `${slideCount} ${slideCount === 1 ? "slide" : "slides"} in one ZIP, each a full-size PNG${videoSlides ? `, or an MP4 for the ${videoSlides} with a clip` : ""}, plus caption.txt.`
                  : kind === "pdf"
                    ? `One PDF, one slide to a page, which is how LinkedIn takes a carousel.${videoSlides ? " A video slide shows its first frame." : ""}`
                    : "A 9:16 video with every slide in turn, made as a new project you can still change, and exported like any video."}
              </p>
              {kind === "video" ? (
                <div className="grid gap-4">
                  <NumberField
                    id="carousel-video-seconds"
                    label="Seconds each slide stays up"
                    hint="A slide with a clip plays for the clip's own length, up to a minute."
                    value={seconds}
                    min={CAROUSEL_VIDEO_SECONDS.min}
                    max={CAROUSEL_VIDEO_SECONDS.max}
                    onChange={setSeconds}
                  />
                  <div className="grid gap-2">
                    <FieldLabel hint="Fade and Slide blend half a second across each change, so the video runs no longer for them.">
                      Between slides
                    </FieldLabel>
                    <Tabs
                      value={transition}
                      onValueChange={(value) => setTransition(value as CarouselVideoTransition)}
                    >
                      <TabsList>
                        {TRANSITIONS.map((option) => (
                          <TabsTrigger key={option.id} value={option.id}>
                            {option.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="carousel-video-music" hint="Tracks on your music shelf, from the video editor's Music panel.">
                      Music
                    </FieldLabel>
                    <Select value={musicId} onValueChange={setMusicId}>
                      <SelectTrigger id="carousel-video-music">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_MUSIC}>No music</SelectItem>
                        {(music ?? []).map((file) => (
                          <SelectItem key={file.id} value={file.id}>
                            {file.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {`${slideCount} ${slideCount === 1 ? "slide" : "slides"} at ${seconds} seconds is ${slideCount * seconds} seconds${videoSlides ? ", plus however long the clips run past that" : ""}.`}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Post caption</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="carousel-export-caption">
                  Saved as caption.txt and shown under a shared link
                </FieldLabel>
                <Textarea
                  id="carousel-export-caption"
                  value={caption}
                  maxLength={2_200}
                  rows={1}
                  disabled={working || writingCaption}
                  onChange={(event) => onUpdateCaption(event.target.value)}
                />
              </div>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={working || writingCaption}
                  onClick={onWriteCaption}
                >
                  {writingCaption ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <SparklesIcon />
                  )}
                  {writingCaption ? "Writing" : "Write it with AI"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={working}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={working} onClick={() => void handleExport()}>
            {working ? <Loader2Icon className="size-4 animate-spin" /> : <Icon className="size-4" />}
            {working ? (kind === "video" ? "Making" : "Exporting") : label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const SOUND_LENGTH_WAIT_MS = 5_000

/**
 * A sound file's length in milliseconds, read by the browser, or null when it
 * cannot be read within five seconds.
 */
function soundLength(url: string) {
  return new Promise<number | null>((resolve) => {
    const audio = new Audio()
    const timer = window.setTimeout(() => done(null), SOUND_LENGTH_WAIT_MS)
    function done(value: number | null) {
      window.clearTimeout(timer)
      audio.onloadedmetadata = null
      audio.onerror = null
      audio.removeAttribute("src")
      resolve(value)
    }
    audio.preload = "metadata"
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : null)
    audio.onerror = () => done(null)
    audio.src = url
  })
}
