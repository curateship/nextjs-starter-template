import * as React from "react"
import { ExternalLinkIcon, Loader2Icon, RotateCwIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

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
import { DisabledReason } from "@/components/ui/disabled-reason"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Meter } from "@/components/ui/meter"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getPromoErrorMessage,
  loadPromoProjects,
  refreshPromoSends,
  retryPromoSend,
  sendToPromo,
  type PromoProjectOption,
  type PromoSendView,
} from "@/lib/api/video/promo"
import { loadMusicShelf, type MusicShelfFile } from "@/lib/api/video/music"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { PROMO_DRAFT_NETWORKS, PROMO_NETWORK_LABELS, type PromoDraftNetwork } from "@/lib/video/promo"

/** What the window sends: one or more exports, or thumbnails. */
export type PromoSendTarget = {
  /** What the heading names, such as the export's title or "3 exports". */
  name: string
  kind: "video" | "carousel" | "picture"
  exportIds?: string[]
  thumbnailIds?: string[]
  /** The video or carousel project it came from, so the window opens on the last pick (part 5). */
  sourceProjectId?: string | null
  /** A video with language copies offers to send them too (part 11). */
  hasLanguageCopies?: boolean
  /** Earlier sends of these, for the question about sending again (part 17). */
  earlier?: PromoSendView[]
  /** Ticked exports left out because they are not finished, to say so. */
  leftOut?: number
}

/** The sound picker's value for a silent slideshow. A select item can't be "". */
const NO_SOUND = "none"

/** How often the window asks how the sends are doing while one is on its way. */
const POLL_MS = 2_000

/**
 * Send to Promo (`workspace/docs/send-to-promo.md`). Lists the Promo projects,
 * opening on the ones picked last time for this project; any number may be
 * ticked. Then the networks to leave a draft in, and for a video with
 * language copies, whether to send those too. Pressing Send starts one send
 * per thing per project and shows each one's progress until it lands.
 */
export function SendToPromoDialog({
  target,
  onClose,
  onSent,
}: {
  target: PromoSendTarget
  onClose: () => void
  /** Called once the sends have started, so the page behind can show them. */
  onSent?: () => void
}) {
  const [projects, setProjects] = React.useState<PromoProjectOption[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [drafts, setDrafts] = React.useState<Set<PromoDraftNetwork>>(new Set())
  const [withCopies, setWithCopies] = React.useState(Boolean(target.hasLanguageCopies))
  const [pdf, setPdf] = React.useState(false)
  const [slideshow, setSlideshow] = React.useState(false)
  const [soundId, setSoundId] = React.useState<string>(NO_SOUND)
  const [music, setMusic] = React.useState<MusicShelfFile[] | null>(null)
  const [again, setAgain] = React.useState<"replace" | "new">("replace")
  const [sends, setSends] = React.useState<PromoSendView[] | null>(null)
  const [skipped, setSkipped] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    loadPromoProjects(target.sourceProjectId ?? undefined).then(
      (answer) => {
        if (cancelled) return
        setProjects(answer.projects)
        setPicked(new Set(answer.picked))
      },
      (error: unknown) => {
        if (!cancelled) setLoadError(getPromoErrorMessage(error))
      }
    )
    return () => {
      cancelled = true
    }
  }, [reloads, target.sourceProjectId])

  // The music a slideshow may play, read once the box is ticked.
  React.useEffect(() => {
    if (!slideshow || music) return
    let cancelled = false
    loadMusicShelf().then(
      (files) => {
        if (!cancelled) setMusic(files)
      },
      () => {
        if (!cancelled) setMusic([])
      }
    )
    return () => {
      cancelled = true
    }
  }, [music, slideshow])

  // While any send is on its way, ask how it is doing.
  const waiting = sends?.filter((send) => send.status === "sending").map((send) => send.id) ?? []
  const waitingKey = waiting.join(",")
  React.useEffect(() => {
    if (!waitingKey) return
    const timer = setInterval(() => {
      refreshPromoSends(waitingKey.split(",")).then(
        (fresh) => setSends((current) => current?.map((send) => fresh.find((row) => row.id === send.id) ?? send) ?? null),
        () => undefined
      )
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [waitingKey])

  const chosen = projects?.filter((project) => picked.has(project.id)) ?? []
  const networks = PROMO_DRAFT_NETWORKS.filter((network) => chosen.some((project) => project.networks.includes(network)))
  const ids = [...(target.exportIds ?? []), ...(target.thumbnailIds ?? [])]
  // Things already sent to a ticked project: Replace puts the new file on that archive item.
  const already = (target.earlier ?? []).filter(
    (send) => send.status === "sent" && send.kind !== "slideshow" && picked.has(send.promoProjectId) && ids.includes(send.exportId ?? send.thumbnailId ?? "")
  )

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  async function send() {
    if (!chosen.length) {
      showErrorToast("Pick a Promo project first.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const replace =
        again === "replace"
          ? // Keyed by kind too: a carousel and its slideshow share the export's id.
            Object.fromEntries(already.map((send) => [`${send.kind}:${send.exportId ?? send.thumbnailId}:${send.promoProjectId}`, send.promoItemId]))
          : {}
      const answer = await sendToPromo({
        exportIds: target.exportIds,
        thumbnailIds: target.thumbnailIds,
        promoProjects: chosen.map((project) => ({ id: project.id, name: project.name })),
        drafts: [...drafts].filter((network) => networks.includes(network) && !(network === "x" && target.kind !== "picture")),
        withLanguageCopies: withCopies,
        replace,
        pdf,
        slideshow: target.kind === "carousel" && slideshow ? { soundId: soundId === NO_SOUND ? null : soundId } : null,
      })
      setSends(answer.sends)
      setSkipped(answer.skipped)
      onSent?.()
    } catch (error) {
      showErrorToast(getPromoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function retry(sendId: string) {
    dismissErrorToast()
    try {
      const fresh = await retryPromoSend(sendId)
      setSends((current) => current?.map((send) => (send.id === sendId ? fresh : send)) ?? null)
    } catch (error) {
      showErrorToast(getPromoErrorMessage(error))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Send to Promo</DialogTitle>
          <DialogDescription>
            {target.name} goes into the Archive of each Promo project you tick, as Promo's own copy.
            {target.leftOut
              ? ` ${target.leftOut} ${plural(target.leftOut, "export isn't", "exports aren't")} finished, so ${plural(target.leftOut, "it was", "they were")} left out.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {sends ? (
            <SendProgress sends={sends} skipped={skipped} onRetry={retry} />
          ) : loadError ? (
            <Card size="sm">
              <CardContent className="grid gap-3">
                <ErrorRow
                  message={loadError}
                  onRetry={() => {
                    setLoadError(null)
                    setReloads((count) => count + 1)
                  }}
                />
                <Button asChild variant="outline" className="justify-self-start">
                  <Link to="/admin/settings/$tab" params={{ tab: "promo" }}>
                    Open Settings → Promo
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : !projects ? (
            <LoadingRow label="Asking Promo for its projects…" />
          ) : (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Promo project</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {projects.length ? (
                    projects.map((project) => (
                      <div key={project.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`promo-project-${project.id}`}
                          checked={picked.has(project.id)}
                          onCheckedChange={() => setPicked((current) => toggle(current, project.id))}
                        />
                        <Label htmlFor={`promo-project-${project.id}`}>{project.name}</Label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Promo has no projects yet. Make one on Promo's Projects dashboard first.</p>
                  )}
                </CardContent>
              </Card>

              {networks.length ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Leave a draft in</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {networks.map((network) => {
                      const off = network === "x" && target.kind !== "picture"
                      return (
                        <DisabledReason key={network} disabled={off} reason="X takes pictures only.">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`promo-draft-${network}`}
                              disabled={off}
                              checked={!off && drafts.has(network)}
                              onCheckedChange={() => setDrafts((current) => toggle(current, network))}
                            />
                            <Label htmlFor={`promo-draft-${network}`}>{PROMO_NETWORK_LABELS[network]}</Label>
                          </div>
                        </DisabledReason>
                      )
                    })}
                  </CardContent>
                </Card>
              ) : null}

              {target.hasLanguageCopies || target.kind === "carousel" ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Also</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    {target.hasLanguageCopies ? (
                      <div className="flex items-center gap-2">
                        <Checkbox id="promo-copies" checked={withCopies} onCheckedChange={(value) => setWithCopies(value === true)} />
                        <Label htmlFor="promo-copies">With every language copy</Label>
                      </div>
                    ) : null}
                    {target.kind === "carousel" ? (
                      <div className="flex items-center gap-2">
                        <Checkbox id="promo-pdf" checked={pdf} onCheckedChange={(value) => setPdf(value === true)} />
                        <Label htmlFor="promo-pdf">Also as a PDF for LinkedIn</Label>
                      </div>
                    ) : null}
                    {target.kind === "carousel" ? (
                      <div className="flex items-center gap-2">
                        <Checkbox id="promo-slideshow" checked={slideshow} onCheckedChange={(value) => setSlideshow(value === true)} />
                        <Label htmlFor="promo-slideshow">Also as a slideshow video, a slide every 3 seconds</Label>
                      </div>
                    ) : null}
                    {target.kind === "carousel" && slideshow ? (
                      <div className="grid gap-2">
                        <Label htmlFor="promo-slideshow-sound">Slideshow sound</Label>
                        {music ? (
                          <Select value={soundId} onValueChange={setSoundId}>
                            <SelectTrigger id="promo-slideshow-sound" className="sm:w-72">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_SOUND}>No sound</SelectItem>
                              {music.map((file) => (
                                <SelectItem key={file.id} value={file.id}>
                                  {file.original_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <LoadingRow label="Reading your music…" />
                        )}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {already.length ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Already in Promo</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <p className="text-sm text-muted-foreground">
                      This was sent to {[...new Set(already.map((send) => send.promoProjectName))].join(", ")} before.
                    </p>
                    <div className="grid gap-2">
                      <Label htmlFor="promo-again">Send it</Label>
                      <Select value={again} onValueChange={(value) => setAgain(value === "new" ? "new" : "replace")}>
                        <SelectTrigger id="promo-again" className="sm:w-72">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="replace">Replace the one in the archive</SelectItem>
                          <SelectItem value="new">Send as new</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {sends ? (
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={busy} onClick={() => void send()}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Send to Promo
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Each send's way into Promo: a bar while it goes across, then where it landed or why not. */
function SendProgress({
  sends,
  skipped,
  onRetry,
}: {
  sends: PromoSendView[]
  skipped: string[]
  onRetry: (sendId: string) => Promise<void>
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-4">
        {sends.map((send) => (
          <div key={send.id} className="grid gap-2">
            {send.status === "sending" ? (
              <>
                <span className="text-sm">
                  {send.kind === "slideshow" ? "Making the slideshow and sending it" : "Sending"} to {send.promoProjectName}…
                </span>
                <Meter
                  value={Math.round(send.progress * 100)}
                  label={`Sending to ${send.promoProjectName}`}
                  valueText={send.progress ? `${Math.round(send.progress * 100)} out of 100` : "Starting"}
                />
              </>
            ) : send.status === "sent" ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  {send.kind === "slideshow" ? "Slideshow sent" : "Sent"} to {send.promoProjectName}
                </span>
                {send.promoItemUrl ? (
                  <Button asChild variant="ghost" size="sm">
                    <a href={send.promoItemUrl} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon className="size-4" />
                      Open in Promo
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-destructive">
                  {send.kind === "slideshow" ? "The slideshow didn't reach" : "Didn't reach"} {send.promoProjectName}. {send.error}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => void onRetry(send.id)}>
                  <RotateCwIcon className="size-4" />
                  Try again
                </Button>
              </div>
            )}
          </div>
        ))}
        {skipped.length ? (
          <p className="text-sm text-muted-foreground">
            Skipped {skipped.length} language {plural(skipped.length, "copy", "copies")} with no export in this shape: {skipped.join(", ")}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
