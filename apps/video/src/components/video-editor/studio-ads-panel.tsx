import * as React from "react"
import {
  ChevronRightIcon,
  ClipboardCopyIcon,
  FilmIcon,
  ImagesIcon,
  Loader2Icon,
  MegaphoneIcon,
  MicIcon,
  PlusIcon,
  RepeatIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TypeIcon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { MediaPicker } from "@/components/media/media-picker"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  FoldingMenu,
  MenuAction,
  MenuLine,
  MenuSection,
  useOpenSections,
} from "@/components/shared/folding-menu"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Hint } from "@/components/video-assets/hint"
import { AdReadDialog } from "@/components/video-editor/ad-read-dialog"
import { useCaptionSettings } from "@/components/video-editor/caption-settings-context"
import {
  useEditorRuntime,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import { useDragToTimeline } from "@/components/video-editor/use-drag-to-timeline"
import { LengthCounter } from "@/components/video-assets/length-counter"
import { getMediaErrorMessage, uploadMedia } from "@/lib/api/media/media"
import {
  addClipToShelf,
  addLibraryFileToShelf,
  addTextToShelf,
  getAdsErrorMessage,
  loadAdsShelf,
  loadLoudness,
  loadViewerCurves,
  removeFromShelf,
  removeTextAdLook,
  writeAdText,
  type AdsShelf,
  type ShelfAd,
} from "@/lib/api/video/ads"
import { loadAiToolsAvailability } from "@/lib/api/video/ai-tools"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { WriterId } from "@/lib/video/ai-choices"
import { withEstimate, writerCostCents } from "@/lib/video/ai-estimates"
import {
  AD_ABOUT_MAX,
  AD_TOO_FEW_CURVES_MESSAGE,
  DEFAULT_TEXT_AD_LOOK,
  MAX_ADS_PLACED,
  TEXT_AD_MAX,
  adBreakTimes,
  adCountForLength,
  adLoad,
  adsOf,
  clipAdTemplate,
  formatAdLength,
  layAd,
  lengthForPlacing,
  matchedVolume,
  placeAdAtEdge,
  placeAds,
  removeAllAds,
  swapAds,
  textAdSafeBox,
  textAdTemplate,
  viewerSpots,
  voiceMediaId,
  type AdTemplate,
  type TextAdLook,
} from "@/lib/video/ads"
import { editorId, loadMediaDurationMs } from "@/lib/video/timeline-utils"
import { cn } from "@/lib/utils"

/**
 * The Ads panel (`workspace/docs/ads.md`): your ads shelf, placing an ad in
 * equal parts or where viewers stay, a text ad over the video, and what the
 * video's ads add up to. Everything it does to the timeline is one undo step.
 */

type Busy = "place" | "start" | "end" | "swap" | "add" | "write" | "upload" | null

const STANDARD_LOOK = "standard"

export function AdsPanel() {
  const { store, dispatch, clock, videoId } = useEditorRuntime()
  const tracks = useEditorSelector((state) => state.tracks)
  const aspect = useEditorSelector((state) => state.aspect)
  const { look: captionLook, safeBoxes } = useCaptionSettings()
  const [shelf, setShelf] = React.useState<AdsShelf | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [pickedId, setPickedId] = React.useState<string | null>(null)
  const [countDraft, setCountDraft] = React.useState<string | null>(null)
  const [where, setWhere] = React.useState<"equal" | "viewers">("equal")
  const [busy, setBusy] = React.useState<Busy>(null)
  const [removingId, setRemovingId] = React.useState<string | null>(null)
  const [words, setWords] = React.useState("")
  const [lookId, setLookId] = React.useState(STANDARD_LOOK)
  const [readOpen, setReadOpen] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const [writer, setWriter] = React.useState<WriterId | null>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<"text" | "video" | "count">()
  const [swapFromId, setSwapFromId] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)
  // What has been measured once is not measured again while the editor is open.
  const lengths = React.useRef(new Map<string, number>())
  const loudness = React.useRef(new Map<string, number | null>())

  React.useEffect(() => {
    let active = true
    loadAdsShelf()
      .then((loaded) => {
        if (!active) return
        setShelf(loaded)
        setLoadFailed(false)
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [refresh])

  React.useEffect(() => {
    let active = true
    loadAiToolsAvailability()
      .then((available) => {
        if (active) setWriter(available.writer as WriterId | null)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const ads = shelf?.ads ?? []
  const picked = ads.find((ad) => ad.id === pickedId) ?? null
  const rules = shelf?.rules
  const placingMs = lengthForPlacing(tracks)
  const suggested = rules ? adCountForLength(placingMs, rules) : 1
  const count = countDraft ?? String(suggested)
  const safeBox = textAdSafeBox(aspect, captionLook.platform, safeBoxes)
  const look: TextAdLook =
    shelf?.looks.find((saved) => saved.id === lookId)?.look ?? DEFAULT_TEXT_AD_LOOK
  const load = adLoad(tracks, rules?.limitPercent ?? 15)
  const breaks = adBreakTimes(tracks)
  const inVideo = adsOf(tracks)
  // The shelf ads that are in this video, for Swap.
  const swappable = ads.filter(
    (ad) => ad.id !== pickedId && inVideo.some(({ clip }) => clip.ad.shelfId === ad.id)
  )
  const swapFrom = swappable.find((ad) => ad.id === swapFromId) ?? null

  async function lengthOf(url: string, kind: "video" | "audio") {
    const known = lengths.current.get(url)
    if (known !== undefined) return known
    const measured = await loadMediaDurationMs(url, kind)
    lengths.current.set(url, measured)
    return measured
  }

  /** How loud the ad plays so it matches the voice in this video (ads.ts, matchedVolume). */
  async function volumeFor(mediaId: string) {
    const voice = voiceMediaId(store.getSnapshot().state.tracks)
    if (!voice) return undefined
    const wanted = [mediaId, voice].filter((id) => !loudness.current.has(id))
    if (wanted.length) {
      try {
        const measured = await loadLoudness(wanted)
        for (const id of wanted) loudness.current.set(id, measured[id] ?? null)
      } catch {
        // Not measured: the ad plays as recorded.
        return undefined
      }
    }
    return matchedVolume(loudness.current.get(mediaId) ?? null, loudness.current.get(voice) ?? null)
  }

  async function templateFor(ad: ShelfAd): Promise<AdTemplate> {
    if (ad.kind === "text" || !ad.media) {
      return textAdTemplate({
        text: ad.text ?? ad.name,
        look: ad.look ?? DEFAULT_TEXT_AD_LOOK,
        shelfId: ad.id,
        safeBox,
      })
    }
    const { media } = ad
    const [durationMs, volume] = await Promise.all([
      lengthOf(media.url, media.file_type),
      volumeFor(media.id),
    ])
    return clipAdTemplate({
      shelfId: ad.id,
      name: ad.name,
      mediaId: media.id,
      url: media.url,
      fileType: media.file_type,
      durationMs,
      volume,
    })
  }

  function apply(
    result: ReturnType<typeof placeAds> | ReturnType<typeof layAd>,
    done?: string
  ) {
    if ("refusal" in result) {
      showErrorToast(result.refusal)
      return false
    }
    const laid = Array.isArray(result) ? { tracks: result } : result
    dispatch({
      type: "EDIT_ADS",
      tracks: laid.tracks,
      selectClipId: "clipId" in laid ? laid.clipId : undefined,
    })
    if (done) toast.success(`${done} Undo takes it back.`)
    return true
  }

  async function run(which: Busy, work: () => Promise<void>) {
    setBusy(which)
    try {
      await work()
    } catch (error) {
      showErrorToast(getAdsErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function addAt(ad: ShelfAd, atMs: number) {
    void run("add", async () => {
      const template = await templateFor(ad)
      apply(layAd(store.getSnapshot().state.tracks, template, atMs, editorId))
    })
  }

  function place() {
    if (!picked) return
    const wanted = Number.parseInt(count, 10)
    if (!Number.isFinite(wanted) || wanted < 1 || wanted > MAX_ADS_PLACED) {
      showErrorToast(`Pick between 1 and ${MAX_ADS_PLACED} ads.`)
      return
    }
    void run("place", async () => {
      const template = await templateFor(picked)
      const current = store.getSnapshot().state.tracks
      let spots: number[] | undefined
      if (where === "viewers") {
        const curves = await loadViewerCurves(videoId)
        spots =
          viewerSpots({ curves, lengthMs: lengthForPlacing(current), count: wanted }) ?? undefined
        if (!spots) toast(AD_TOO_FEW_CURVES_MESSAGE)
      }
      // Where viewers stay can find fewer good spots than asked for.
      const laid = spots?.length ?? wanted
      apply(
        placeAds(current, template, laid, editorId, spots),
        `Placed ${laid} ${laid === 1 ? "ad" : "ads"}.`
      )
    })
  }

  function placeAtEdge(edge: "start" | "end") {
    if (!picked) return
    void run(edge, async () => {
      const template = await templateFor(picked)
      apply(placeAdAtEdge(store.getSnapshot().state.tracks, template, edge, editorId))
    })
  }

  function swapAdsFrom(from: ShelfAd) {
    if (!picked) return
    void run("swap", async () => {
      const template = await templateFor(picked)
      apply(
        swapAds(store.getSnapshot().state.tracks, from.id, template, editorId),
        `Every ${from.name} is now ${picked.name}.`
      )
    })
  }

  function removeAll() {
    dispatch({ type: "EDIT_ADS", tracks: removeAllAds(store.getSnapshot().state.tracks) })
    toast.success("Every ad is off the video. Undo puts them back.")
  }

  function copyBreakTimes() {
    void navigator.clipboard
      ?.writeText(breaks.times)
      .then(() => toast.success(`Copied ${breaks.times}`))
      .catch(() => showErrorToast("The times could not be copied. Select them and copy instead."))
  }

  async function reloadShelf() {
    const loaded = await loadAdsShelf()
    setShelf(loaded)
    return loaded
  }

  async function handleUpload(list: FileList | null) {
    const file = list?.[0]
    if (!file) return
    await run("upload", async () => {
      let mediaId: string
      try {
        mediaId = (await uploadMedia(file)).id
      } catch (error) {
        showErrorToast(`${file.name}: ${getMediaErrorMessage(error)}`)
        return
      }
      const shelfId = await addClipToShelf(mediaId)
      await reloadShelf()
      setPickedId(shelfId)
    })
  }

  function addFromLibrary(url: string) {
    setPicking(false)
    void run("upload", async () => {
      const shelfId = await addLibraryFileToShelf(url)
      await reloadShelf()
      setPickedId(shelfId)
    })
  }

  async function takeOff(ad: ShelfAd) {
    setRemovingId(ad.id)
    try {
      await removeFromShelf(ad.id)
      if (pickedId === ad.id) setPickedId(null)
      await reloadShelf()
    } catch (error) {
      showErrorToast(getAdsErrorMessage(error))
    } finally {
      setRemovingId(null)
    }
  }

  async function readMade(shelfId: string) {
    try {
      const loaded = await reloadShelf()
      setPickedId(shelfId)
      const made = loaded.ads.find((ad) => ad.id === shelfId)
      if (made) addAt(made, clock.getTime())
    } catch (error) {
      showErrorToast(getAdsErrorMessage(error))
    }
  }

  function textAdAtPlayhead() {
    if (!words.trim()) {
      showErrorToast("Type the ad's words first.")
      return
    }
    apply(
      layAd(
        store.getSnapshot().state.tracks,
        textAdTemplate({ text: words, look, safeBox }),
        clock.getTime(),
        editorId
      )
    )
  }

  function saveTextToShelf() {
    if (!words.trim()) {
      showErrorToast("Type the ad's words first.")
      return
    }
    void run("add", async () => {
      const shelfId = await addTextToShelf(words.trim(), look)
      await reloadShelf()
      setPickedId(shelfId)
      toast.success("Saved to your ads shelf.")
    })
  }

  function writeWithAi() {
    if (!words.trim()) {
      showErrorToast("Type a few words about the product first, then press Write with AI.")
      return
    }
    void run("write", async () => {
      setWords(await writeAdText(words.trim().slice(0, AD_ABOUT_MAX), videoId))
    })
  }

  async function forgetLook(id: string) {
    try {
      await removeTextAdLook(id)
      setLookId(STANDARD_LOOK)
      await reloadShelf()
    } catch (error) {
      showErrorToast(getAdsErrorMessage(error))
    }
  }

  const { dragHandlers, ghost } = useDragToTimeline<ShelfAd>({
    label: (ad) => ad.name,
    // An ad always lands on the Ads lane, whichever lane it was dropped on.
    onDrop: (ad, atMs) => addAt(ad, atMs),
  })

  const writeCents = writer ? writerCostCents(writer, 600 + words.length, 60) : null

  // Every action that changes the video closes the menu, so the timeline shows
  // what it did.
  function closeAnd(action: () => void) {
    setMenuOpen(false)
    setAddOpen(false)
    action()
  }

  // After the + has closed, so a window it opens keeps the focus.
  function closeThen(open: () => void) {
    setAddOpen(false)
    window.setTimeout(open, 0)
  }

  // What drops down under the picked shelf ad (Tyler, 4 Nov 2026: "this
  // should be an option that drops down after clicking the ad").
  const placeOptions = (
    <div className="grid gap-4">
      {/* A picker rather than two tabs: "Where viewers stay" alone is wider
          than the panel when it opens at its narrowest. */}
      <div className="grid gap-2">
        <Label htmlFor="ads-where">Where</Label>
        <Select value={where} onValueChange={(value) => setWhere(value as typeof where)}>
          <SelectTrigger id="ads-where" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equal">Equal parts</SelectItem>
            <SelectItem value="viewers">Where viewers stay</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy !== null} onClick={place}>
          {busy === "place" ? <Loader2Icon className="animate-spin" /> : null}
          Place ads
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => placeAtEdge("start")}
        >
          At the start
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => placeAtEdge("end")}
        >
          At the end
        </Button>
      </div>
    </div>
  )

  const loadValue = load.count ? `${load.count} ${load.count === 1 ? "ad" : "ads"}` : "None"
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<MegaphoneIcon className="size-4" />}
        title="Ads"
        action={
          <div className="flex items-center gap-2">
            {/* The + adds: a text ad, a sponsor clip, one from the media
                library or an AI read (Tyler, 4 Nov 2026: "Put the add text
                add to the + dropdown"). The ⋮ checks the video's ads ("put it
                in the 3 vertical dot dropdown"). Placing drops down under the
                ad picked on the shelf. */}
            <FoldingMenu
              label="Add an ad"
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy === "upload"}
                  aria-label="Add an ad"
                >
                  {busy === "upload" ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                </Button>
              }
            >
              {/* Drawn like the actions under it, an icon and a name, and folds
                  open to the text ad's fields (Tyler, 4 Nov 2026: "fix ui"). */}
              <Collapsible open={shown.has("text")} onOpenChange={() => toggle("text")}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" className="w-full justify-start text-[13px] font-normal">
                    <TypeIcon />
                    Text ad
                    <ChevronRightIcon
                      aria-hidden
                      className={cn(
                        "ml-auto text-muted-foreground transition-transform",
                        shown.has("text") && "rotate-90"
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="p-2 text-sm">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="ads-text">Words</Label>
                    <Textarea
                      id="ads-text"
                      rows={1}
                      maxLength={Math.max(TEXT_AD_MAX, AD_ABOUT_MAX)}
                      value={words}
                      placeholder="Try Brightly free for 30 days, code TYLER"
                      onChange={(event) => setWords(event.target.value)}
                    />
                    <LengthCounter length={words.length} max={Math.max(TEXT_AD_MAX, AD_ABOUT_MAX)} />
                    <p className="text-xs text-muted-foreground">
                      Along the bottom for 8 seconds. Or type a few words about the product and
                      press Write with AI.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ads-look">Look</Label>
                    <div className="flex items-center gap-2">
                      <Select value={lookId} onValueChange={setLookId}>
                        <SelectTrigger id="ads-look" className="min-w-0 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={STANDARD_LOOK}>Standard</SelectItem>
                          {(shelf?.looks ?? []).map((saved) => (
                            <SelectItem key={saved.id} value={saved.id}>
                              {saved.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {lookId !== STANDARD_LOOK ? (
                        <Hint label="Forget this look">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Forget this look"
                            onClick={() => void forgetLook(lookId)}
                          >
                            <Trash2Icon />
                          </Button>
                        </Hint>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => closeAnd(textAdAtPlayhead)}>
                      Add at playhead
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={saveTextToShelf}
                    >
                      Save to shelf
                    </Button>
                    <Button type="button" variant="outline" disabled={busy !== null} onClick={writeWithAi}>
                      {busy === "write" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                      {withEstimate("Write with AI", writeCents)}
                    </Button>
                  </div>
                </div>
                </CollapsibleContent>
              </Collapsible>

              <MenuAction icon={<UploadIcon />} onClick={() => closeThen(() => fileRef.current?.click())}>
                Upload a sponsor clip
              </MenuAction>
              <MenuAction icon={<ImagesIcon />} onClick={() => closeThen(() => setPicking(true))}>
                From your media
              </MenuAction>
              <MenuAction icon={<SparklesIcon />} onClick={() => closeThen(() => setReadOpen(true))}>
                AI sponsor read
              </MenuAction>
            </FoldingMenu>
            <FoldingMenu label="This video's ads" open={menuOpen} onOpenChange={setMenuOpen}>
              {/* How many ads the video gets is about the video, not one ad
                  (Tyler, 4 Nov 2026: "shouldn't that be in the 3 dot
                  dropdown options?"). Place ads on a shelf ad uses it. */}
              <MenuSection
                label="Ads in this video"
                value={count}
                open={shown.has("count")}
                onToggle={() => toggle("count")}
              >
                <div className="grid gap-2">
                  <Label htmlFor="ads-count">How many times Place ads puts an ad in</Label>
                  <Input
                    id="ads-count"
                    type="number"
                    min={1}
                    max={MAX_ADS_PLACED}
                    className="w-20"
                    value={count}
                    onChange={(event) => setCountDraft(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Starts on what Settings gives a video this long: {suggested} for this one.
                  </p>
                </div>
              </MenuSection>
              <MenuSection
                label="In this video"
                value={loadValue}
                open={shown.has("video")}
                onToggle={() => toggle("video")}
              >
                {load.count ? (
                  <div className="grid gap-4">
                    <p>
                      {load.count} {load.count === 1 ? "ad" : "ads"}, {formatAdLength(load.adMs)} of
                      a {formatAdLength(load.videoMs)} video
                    </p>
                    {load.tooMany ? (
                      <p className="flex items-start gap-2 text-destructive">
                        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                        That is more than {rules?.limitPercent ?? 15} out of every 100 seconds, the
                        limit in Settings.
                      </p>
                    ) : null}
                    {breaks.times ? (
                      <div className="grid gap-2">
                        <Button type="button" variant="outline" className="justify-self-start" onClick={copyBreakTimes}>
                          <ClipboardCopyIcon />
                          Copy ad break times
                        </Button>
                        {breaks.tooShort ? (
                          <p className="text-xs text-muted-foreground">
                            YouTube only allows ad breaks in videos 8 minutes or longer.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {picked && swappable.length ? (
                      <div className="grid gap-2">
                        <Label htmlFor="ads-swap">Swap for {picked.name}</Label>
                        <div className="flex items-center gap-2">
                          <Select value={swapFromId ?? ""} onValueChange={setSwapFromId}>
                            <SelectTrigger id="ads-swap" className="min-w-0 flex-1">
                              <SelectValue placeholder="Every ad of" />
                            </SelectTrigger>
                            <SelectContent>
                              {swappable.map((ad) => (
                                <SelectItem key={ad.id} value={ad.id}>
                                  Every {ad.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy !== null || !swapFrom}
                            onClick={() =>
                              closeAnd(() => {
                                if (swapFrom) swapAdsFrom(swapFrom)
                              })
                            }
                          >
                            {busy === "swap" ? <Loader2Icon className="animate-spin" /> : <RepeatIcon />}
                            Swap
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No ads in this video yet.</p>
                )}
              </MenuSection>

              {load.count ? (
                <>
                  <MenuLine />
                  <MenuAction icon={<Trash2Icon />} destructive onClick={() => closeAnd(removeAll)}>
                    Take every ad off
                  </MenuAction>
                </>
              ) : null}
            </FoldingMenu>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,audio/*"
              hidden
              onChange={(event) => {
                void handleUpload(event.target.files)
                event.target.value = ""
              }}
            />
          </div>
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <section className="grid gap-2" aria-label="Your ads">
            <h3 className="text-xs font-medium text-muted-foreground">
              Your ads{shelf ? ` · ${ads.length}` : ""}
            </h3>
            {loadFailed ? (
              <ErrorRow
                message="Your ads could not be loaded."
                onRetry={() => setRefresh((n) => n + 1)}
                className="py-4"
              />
            ) : shelf === null ? null : ads.length ? (
              <ul className="grid gap-2">
                {ads.map((ad) => (
                  <AdRow
                    key={ad.id}
                    ad={ad}
                    picked={ad.id === pickedId}
                    busy={removingId === ad.id}
                    dragProps={dragHandlers(ad)}
                    onPick={() => setPickedId(ad.id === pickedId ? null : ad.id)}
                    onAdd={() => addAt(ad, clock.getTime())}
                    onRemove={() => void takeOff(ad)}
                  >
                    {placeOptions}
                  </AdRow>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No ads yet. Press + to write a text ad, upload a sponsor clip, pick one from
                your media or make a sponsor read. Then press an ad here to place it.
              </p>
            )}
          </section>
        </div>
      </ScrollArea>
      {ghost}

      <AdReadDialog
        open={readOpen}
        onClose={() => setReadOpen(false)}
        videoId={videoId}
        writer={writer}
        onMade={(shelfId) => void readMade(shelfId)}
      />
      <MediaPicker open={picking} onOpenChange={setPicking} onSelectMedia={addFromLibrary} />
    </div>
  )
}

function adKind(ad: ShelfAd) {
  if (ad.kind === "text") return { Icon: TypeIcon, label: "Text ad" }
  if (ad.read) return { Icon: MicIcon, label: `Sponsor read by ${ad.read.voice_name}` }
  return { Icon: FilmIcon, label: ad.media?.file_type === "audio" ? "Sound" : "Video" }
}

/**
 * One ad on the shelf: press it to pick it for Place ads, drag it onto the
 * timeline, + puts it at the playhead, and the bin takes it off the shelf.
 */
function AdRow({
  ad,
  picked,
  busy,
  dragProps,
  onPick,
  onAdd,
  onRemove,
  children,
}: {
  ad: ShelfAd
  picked: boolean
  busy: boolean
  dragProps: React.HTMLAttributes<HTMLElement>
  onPick: () => void
  onAdd: () => void
  onRemove: () => void
  /** The placing options, dropped down under the row while it is picked. */
  children?: React.ReactNode
}) {
  const { Icon, label } = adKind(ad)
  return (
    <li className={cn("grid rounded-lg border", picked && "border-primary")}>
      {/* The row picks the ad and drags it; the drag captures the pointer, so
        the click arrives on the row rather than on the name. */}
    <div
      {...dragProps}
      onClick={onPick}
      className="grid cursor-grab touch-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 p-1 select-none active:cursor-grabbing"
    >
      <button
        type="button"
        aria-expanded={picked}
        aria-label={`Place ${ad.name}`}
        className="flex min-w-0 items-center gap-2 rounded-md p-1 text-left"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="grid min-w-0">
          <span className="truncate text-xs font-medium">{ad.name}</span>
          <span className="truncate text-xs text-muted-foreground">{label}</span>
        </span>
      </button>
      <Hint label="Add at playhead">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Add ${ad.name} at the playhead`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onAdd()
          }}
        >
          <PlusIcon />
        </Button>
      </Hint>
      <Hint label="Take off the shelf" disabled={busy}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          aria-label={`Take ${ad.name} off your shelf`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          {busy ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
        </Button>
      </Hint>
    </div>
    {picked && children ? <div className="border-t p-3">{children}</div> : null}
    </li>
  )
}
