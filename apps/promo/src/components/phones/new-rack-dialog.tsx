import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { RackPairing } from "@/components/phones/rack-pairing"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getPhoneErrorMessage, makeRack } from "@/lib/api/phones/phones"
import { emptyWrittenPageBody, type WrittenPageNode } from "@/lib/pages/written-page-body"
import { RACK_DESCRIPTION_MAX, RACK_NAME_MAX } from "@/lib/phones/options"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Typed lines as the editor's document, one paragraph a line, so the left panel opens them for editing in place. */
function paragraphs(text: string): WrittenPageNode {
  const lines = text.replace(/\r/g, "").split("\n")
  if (!text.trim()) return emptyWrittenPageBody()
  return {
    type: "doc",
    content: lines.map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
  }
}

/**
 * New rack (Racks dashboard, parts 76 and 78; Tyler, 5 Nov 2026: "create
 * rack > enter name, discription"). Create makes the rack with its name and
 * description, then the same window shows the one-time code and the command
 * that installs the rack program on the computer the phones plug into, for
 * that rack. Once the program pairs, the window says so and opens the rack's
 * page. Open the rack goes there at once; the code keeps working there.
 */
export function NewRackDialog({
  open,
  onClose,
  onOpenRack,
}: {
  open: boolean
  onClose: () => void
  /** Goes to the rack's page, after Create. */
  onOpenRack: (rackId: string) => void
}) {
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [made, setMade] = React.useState<{ id: string; name: string } | null>(null)

  function reset() {
    setName("")
    setDescription("")
    setInvalid(false)
    setMade(null)
  }

  async function create() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the rack a name first.")
      return
    }
    setSaving(true)
    try {
      const { id } = await makeRack({ name: name.trim(), description: paragraphs(description) })
      setMade({ id, name: name.trim() })
    } catch (error) {
      showErrorToast(getPhoneErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function close() {
    reset()
    onClose()
  }

  return (
    <FormDialog open={open} dirty={!made && Boolean(name.trim() || description.trim())} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{made ? `Install ${made.name}` : "New rack"}</DialogTitle>
            <DialogDescription>
              {made
                ? "The rack is made. Install the rack program on the computer its phones plug into, with the command below."
                : "The computer the phones plug into. Name it now; the next step installs the rack program on that computer."}
            </DialogDescription>
          </DialogHeader>
          {made ? (
            <>
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Install the rack program</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RackPairing
                      rackId={made.id}
                      makeAtOnce
                      onPaired={() => {
                        const id = made.id
                        reset()
                        onOpenRack(id)
                      }}
                    />
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Later
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const id = made.id
                    reset()
                    onOpenRack(id)
                  }}
                >
                  Open the rack
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void create()
              }}
            >
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The rack</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="new-rack-name">Name</Label>
                      <Input
                        id="new-rack-name"
                        value={name}
                        maxLength={RACK_NAME_MAX}
                        placeholder="Desk rack"
                        aria-invalid={invalid || undefined}
                        onChange={(event) => {
                          setName(event.target.value)
                          setInvalid(false)
                        }}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-rack-description">Description</Label>
                      <Textarea
                        id="new-rack-description"
                        rows={1}
                        value={description}
                        maxLength={RACK_DESCRIPTION_MAX}
                        placeholder="Where it is, whose internet it uses, what it is for"
                        onChange={(event) => setDescription(event.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2Icon className="animate-spin" /> : null}
                  Create rack
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      )}
    </FormDialog>
  )
}
