import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { LengthCounter } from "@/components/video-assets/length-counter"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { getAdsErrorMessage, makeAdRead } from "@/lib/api/video/ads"
import { loadClonedVoices, type ClonedVoice } from "@/lib/api/video/cloned-voices"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { WriterId } from "@/lib/video/ai-choices"
import { withEstimate, writerCostCents } from "@/lib/video/ai-estimates"
import {
  AD_ABOUT_MAX,
  AD_READ_SECONDS,
  adReadWords,
  type AdReadSeconds,
} from "@/lib/video/ads"

/**
 * AI sponsor read, from the Ads panel's +: what the sponsor sells and how
 * long, then the AI writes the read and your own cloned voice says it. It
 * lands on the ads shelf, remembering its script and voice, and the panel
 * lays it at the playhead (`workspace/docs/ads.md`).
 */
export function AdReadDialog({
  open,
  onClose,
  videoId,
  writer,
  onMade,
}: {
  open: boolean
  onClose: () => void
  videoId: string
  /** The AI that will write the read, for the price; null when none has a key. */
  writer: WriterId | null
  /** Handed the new shelf ad's id. */
  onMade: (shelfId: string) => void
}) {
  const [about, setAbout] = React.useState("")
  const [seconds, setSeconds] = React.useState<AdReadSeconds>(30)
  const [voices, setVoices] = React.useState<ClonedVoice[] | null>(null)
  const [voiceId, setVoiceId] = React.useState("")
  const [making, setMaking] = React.useState(false)
  const [aboutMissing, setAboutMissing] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setAbout("")
      setAboutMissing(false)
    }
  }

  React.useEffect(() => {
    if (!open || voices) return
    let active = true
    loadClonedVoices()
      .then((loaded) => {
        if (!active) return
        setVoices(loaded)
        setVoiceId((current) => current || loaded[0]?.voiceId || "")
      })
      .catch(() => {
        if (active) setVoices([])
      })
    return () => {
      active = false
    }
  }, [open, voices])

  const voice = voices?.find((one) => one.voiceId === voiceId) ?? null
  const words = adReadWords(seconds)
  const priceCents =
    (writer ? writerCostCents(writer, 700 + about.length, words * 2) : 0) +
    aiUnitCostCents("eleven_multilingual_v2", words * 6)

  async function make() {
    if (!about.trim()) {
      setAboutMissing(true)
      showErrorToast("Say what the sponsor sells first.")
      return
    }
    if (!voice) {
      showErrorToast("Clone your voice in Sounds, Voices first, so the read is in your voice.")
      return
    }
    setMaking(true)
    try {
      const shelfId = await makeAdRead({
        about: about.trim(),
        seconds,
        voiceId: voice.voiceId,
        videoId,
      })
      onMade(shelfId)
      onClose()
    } catch (error) {
      showErrorToast(getAdsErrorMessage(error, "The sponsor read could not be made. Try again."))
    } finally {
      setMaking(false)
    }
  }

  return (
    <FormDialog open={open} dirty={!!about.trim()} busy={making} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>AI sponsor read</DialogTitle>
            <DialogDescription>
              The AI writes the read and your own voice says it. It goes on your ads shelf and
              into the video at the playhead.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void make()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The sponsor</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="ad-read-about">What the sponsor sells</Label>
                    <Textarea
                      id="ad-read-about"
                      rows={1}
                      autoFocus
                      maxLength={AD_ABOUT_MAX}
                      value={about}
                      aria-invalid={aboutMissing || undefined}
                      placeholder="Brightly, a budgeting app. 30 days free with code TYLER at brightly.app"
                      onChange={(event) => {
                        setAbout(event.target.value)
                        setAboutMissing(false)
                      }}
                    />
                    <LengthCounter length={about.length} max={AD_ABOUT_MAX} />
                  </div>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The read</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label id="ad-read-length">How long</Label>
                    <Tabs
                      value={String(seconds)}
                      onValueChange={(value) => setSeconds(Number(value) as AdReadSeconds)}
                    >
                      <TabsList aria-labelledby="ad-read-length">
                        {AD_READ_SECONDS.map((option) => (
                          <TabsTrigger key={option} value={String(option)}>
                            {option} seconds
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="ad-read-voice">Your voice</Label>
                    {voices && !voices.length ? (
                      <p className="text-sm text-muted-foreground">
                        You have no voice of your own yet. Make one in Sounds, Voices, with the +.
                      </p>
                    ) : (
                      <Select value={voiceId} onValueChange={setVoiceId} disabled={!voices}>
                        <SelectTrigger id="ad-read-voice" className="sm:w-60">
                          <SelectValue placeholder={voices ? "Pick a voice" : "Loading voices"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(voices ?? []).map((one) => (
                            <SelectItem key={one.voiceId} value={one.voiceId}>
                              {one.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={making} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={making}>
                {making ? <Loader2Icon className="animate-spin" /> : null}
                {withEstimate("Make the read", priceCents)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
