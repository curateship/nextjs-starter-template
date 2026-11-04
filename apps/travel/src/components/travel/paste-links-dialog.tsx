import * as React from "react"
import { CircleAlertIcon, CircleCheckIcon, CircleMinusIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { addActivityFromLink } from "@/lib/api/travel/maps-link"
import { getTravelErrorMessage, isAlreadyOnTrip, TRAVEL_ERRORS } from "@/lib/travel/errors"
import { findMapsLinks, MAPS_LINKS_MAX } from "@/lib/travel/maps-links"
import { showErrorToast } from "@/lib/toast/error-toast"

type Outcome =
  | { link: string; kind: "made"; title: string; photo: boolean }
  | { link: string; kind: "failed"; reason: string }
  /** Already on the trip, so no card was made (More Travel features part 3: "Skip it, say where"). */
  | { link: string; kind: "skipped"; reason: string }

/**
 * Paste Maps links (Travel features part 6; Tyler, 3 Nov 2026: "Ideas, wait
 * for photos"). Up to 20 Google Maps links, one per line or mixed into other
 * text, each become a card in the trip's Ideas. They are filled one at a time,
 * so every one gets its photo and nobody else waits behind a long paste. The
 * window shows each card as it lands. Closing it stops the rest and keeps what
 * was made. A link that can't be read makes no card and is listed with why.
 */
export function PasteLinksDialog({
  open,
  tripId,
  onClose,
  onLanded,
}: {
  open: boolean
  tripId: string
  onClose: () => void
  /** A card was made; the trip reloads so it shows on the board. */
  onLanded: (activityId: string) => Promise<void>
}) {
  const [text, setText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [outcomes, setOutcomes] = React.useState<Outcome[]>([])
  const [total, setTotal] = React.useState(0)
  const [running, setRunning] = React.useState(false)
  const [stoppedFor, setStoppedFor] = React.useState<string | null>(null)
  // Which paste the window shows. Closing it moves this on, so a paste still
  // going ends after the link it is on and never writes into a later one.
  const current = React.useRef(0)
  // Stop: the paste ends after the link it is on, and the window stays on it.
  const stopping = React.useRef(false)
  const found = findMapsLinks(text)
  const started = total > 0

  // Each opening starts with an empty box.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setText("")
      setInvalid(false)
      setOutcomes([])
      setTotal(0)
      setStoppedFor(null)
    }
  }

  function close() {
    // A paste still going stops after the link it is on; what was made stays.
    current.current += 1
    onClose()
  }

  async function start() {
    if (found.length === 0) {
      setInvalid(true)
      showErrorToast("Paste one or more Google Maps links first. Copy each from Share in Google Maps.")
      return
    }
    if (found.length > MAPS_LINKS_MAX) {
      setInvalid(true)
      showErrorToast(`One paste takes at most ${MAPS_LINKS_MAX} links. This one has ${found.length}.`)
      return
    }
    const mine = (current.current += 1)
    const isCurrent = () => current.current === mine
    stopping.current = false
    setRunning(true)
    setTotal(found.length)
    setOutcomes([])
    for (const link of found) {
      if (!isCurrent() || stopping.current) break
      try {
        const made = await addActivityFromLink(tripId, link)
        await onLanded(made.id)
        if (isCurrent()) setOutcomes((was) => [...was, { link, kind: "made", title: made.title, photo: made.photo }])
      } catch (error) {
        if (!isCurrent()) break
        const reason = getTravelErrorMessage(error)
        // The 60 fills in 10 minutes are used up: every link after this would fail the same way.
        if (reason === TRAVEL_ERRORS.tooManySearches) {
          setStoppedFor(reason)
          break
        }
        setOutcomes((was) => [...was, { link, kind: isAlreadyOnTrip(reason) ? "skipped" : "failed", reason }])
      }
    }
    if (isCurrent()) setRunning(false)
  }

  const made = outcomes.filter((outcome) => outcome.kind === "made").length
  const done = started && !running

  return (
    <FormDialog open={open} dirty={!started && text.trim().length > 0} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste Maps links</DialogTitle>
            <DialogDescription>
              Each Google Maps link becomes a place in Ideas, with its name, address and photo.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {started ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle aria-live="polite">
                    {running ? `Adding ${Math.min(outcomes.length + 1, total)} of ${total}` : `Added ${made} of ${total}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <ul className="grid gap-1.5 text-sm">
                    {outcomes.map((outcome) => (
                      <li key={outcome.link} className="flex min-w-0 items-start gap-2">
                        {outcome.kind === "made" ? (
                          <>
                            <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0">
                              <span className="font-medium">{outcome.title}</span>
                              {outcome.photo ? null : (
                                <span className="text-muted-foreground"> · no photo</span>
                              )}
                            </span>
                          </>
                        ) : outcome.kind === "skipped" ? (
                          <>
                            <CircleMinusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="min-w-0 text-muted-foreground">Skipped: {outcome.reason}</span>
                          </>
                        ) : (
                          <>
                            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                            <span className="grid min-w-0">
                              <span className="truncate text-muted-foreground">{outcome.link}</span>
                              <span className="text-destructive">{outcome.reason}</span>
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                    {running ? (
                      <li className="flex items-center gap-2 text-muted-foreground">
                        <Loader2Icon className="size-4 animate-spin" aria-hidden />
                        Reading the next link. Each takes a few seconds.
                      </li>
                    ) : null}
                  </ul>
                  {stoppedFor ? (
                    <p className="text-sm text-destructive">
                      Stopped after {made} of {total}. {stoppedFor}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Links</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor="paste-links-text">Google Maps links</Label>
                  <Textarea
                    id="paste-links-text"
                    value={text}
                    rows={6}
                    placeholder={"https://maps.app.goo.gl/…\nhttps://maps.app.goo.gl/…"}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setText(event.target.value)
                      setInvalid(false)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {found.length === 0
                      ? `Up to ${MAPS_LINKS_MAX} links, one per line or anywhere in the text.`
                      : found.length === 1
                        ? "1 link found."
                        : `${found.length} links found.`}
                  </p>
                </CardContent>
              </Card>
            )}
          </DialogBody>
          <DialogFooter>
            {done ? (
              <Button type="button" onClick={close}>
                Done
              </Button>
            ) : running ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stopping.current = true
                }}
              >
                Stop after this one
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void start()}>
                  Add places
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
