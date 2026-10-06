import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

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
import { getVoiceErrorMessage, saveVoice, type VoiceView } from "@/lib/api/social/voices"
import { voiceUsersWords } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

type Form = { name: string; voice: string; product: string; commentRules: string }

function formFrom(voice: VoiceView | null): Form {
  return {
    name: voice?.name ?? "",
    voice: voice?.voice ?? "",
    product: voice?.product ?? "",
    commentRules: voice?.commentRules ?? "",
  }
}

/**
 * One voice, as a window over the list: its name, and the three things the AI
 * is told when it drafts a comment. Saving it changes every account using it.
 */
export function VoiceDialog({
  open,
  voice,
  onDelete,
  onClose,
  onSaved,
}: {
  open: boolean
  /** Null to write a new one. */
  voice: VoiceView | null
  onDelete: (voice: VoiceView) => void
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const initial = React.useMemo(() => formFrom(voice), [voice])
  const [form, setForm] = React.useState(initial)
  const [saving, setSaving] = React.useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  async function save() {
    setSaving(true)
    try {
      await saveVoice(voice?.id ?? null, form)
      toast.success(voice ? "Voice saved." : "Voice created.")
      await onSaved()
    } catch (error) {
      showErrorToast(getVoiceErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{voice ? voice.name : "New voice"}</DialogTitle>
            <DialogDescription>
              {voice ? `${voiceUsersWords(voice.usedBy)} ` : ""}
              What the AI is told when it drafts a comment.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <div className="grid gap-6">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The voice</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="voice-name">Name</Label>
                      <Input
                        id="voice-name"
                        value={form.name}
                        placeholder="Main voice"
                        onChange={(event) => set("name", event.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>What the AI is told</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="voice-words">How it sounds</Label>
                      <Textarea
                        id="voice-words"
                        rows={1}
                        value={form.voice}
                        placeholder="Plain and direct. I have run a small agency for six years, so I answer from experience rather than theory."
                        onChange={(event) => set("voice", event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="voice-product">
                        What you make, for when it genuinely answers the question
                      </Label>
                      <Textarea
                        id="voice-product"
                        rows={1}
                        value={form.product}
                        placeholder="Leave this empty and no draft will ever mention a product."
                        onChange={(event) => set("product", event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="voice-rules">Lines the AI must not cross</Label>
                      <Textarea
                        id="voice-rules"
                        rows={1}
                        value={form.commentRules}
                        placeholder="Never pretend to be a customer. Never claim a number I have not given you."
                        onChange={(event) => set("commentRules", event.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </DialogBody>
            <DialogFooter>
              {voice ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={saving}
                  onClick={() => onDelete(voice)}
                >
                  <Trash2Icon />
                  Delete
                </Button>
              ) : null}
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {voice ? "Save changes" : "Create voice"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
