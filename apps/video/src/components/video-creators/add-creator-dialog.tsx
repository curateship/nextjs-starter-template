import * as React from "react"

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
import { InlineError } from "@/components/ui/inline-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addCreator, getCreatorErrorMessage } from "@/lib/api/video/creators"
import type { ResearchCreator } from "@/lib/video/creators"

/**
 * Following somebody: paste the link to their profile.
 *
 * A link is asked for rather than a handle because a handle alone does not say
 * which platform it is on, and three platforms have overlapping names.
 */

export function AddCreatorDialog({
  open,
  onOpenChange,
  youtubeKeyConfigured,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** False puts a line in the window rather than failing on the save. */
  youtubeKeyConfigured: boolean
  onAdded: (creator: ResearchCreator) => void
}) {
  const [link, setLink] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setLink("")
      setProblem(null)
    }
  }, [open])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !link.trim()) return
    setBusy(true)
    setProblem(null)
    try {
      const creator = await addCreator(link.trim())
      onAdded(creator)
      onOpenChange(false)
    } catch (error) {
      // Said in the window beside the field rather than in a toast: the thing
      // to fix is the box they are looking at.
      setProblem(getCreatorErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Follow a creator</DialogTitle>
            <DialogDescription>
              Their new videos appear in the middle panel as they post them.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Their profile</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="creator-link">Profile link</Label>
                  <Input
                    id="creator-link"
                    autoFocus
                    placeholder="https://www.youtube.com/@creator"
                    value={link}
                    maxLength={2048}
                    disabled={busy}
                    aria-invalid={problem ? true : undefined}
                    onChange={(event) => {
                      setLink(event.target.value)
                      setProblem(null)
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    A YouTube channel, a TikTok profile or an Instagram profile.
                    Not a link to one of their videos.
                  </p>
                  {problem ? <InlineError>{problem}</InlineError> : null}
                  {!youtubeKeyConfigured ? (
                    <p className="text-xs text-muted-foreground">
                      No YouTube key is saved, so only TikTok and Instagram work
                      for now. Paste one in Settings → YouTube.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !link.trim()}>
              {busy ? "Looking them up…" : "Follow creator"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
