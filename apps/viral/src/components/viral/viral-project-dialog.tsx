import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { KeywordChips, KeywordIdeas } from "@/components/viral/keyword-chips"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { createViralProjectFn, suggestViralKeywords, type ViralFolderSummary } from "@/lib/api/viral/viral-projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { ANALYSIS_TOPIC_MAX } from "@/lib/viral/analysis"
import { NO_FOLDER } from "@/lib/viral/project-folders"
import { SOCIAL_NAMES, SOCIALS, socialHasKeywords, type Social } from "@/lib/viral/socials"
import { unitsPerKeyword, VIRAL_DESCRIPTION_MAX, VIRAL_PROJECT_NAME_MAX, type ViralProjectItem } from "@/lib/viral/viral"

/**
 * The New project window (task part 3): the name, "What do you make, and for
 * whom?" (the topic every script is written for), the socials it starts
 * with, both ticked, and keywords if YouTube is one of them. Keywords are
 * optional: a project that only follows creators needs none. An existing
 * project's settings live in its ⋮ menu on the project page, saving as they
 * change, so this window only ever makes one.
 */

type Draft = {
  name: string
  topic: string
  description: string
  socials: Social[]
  keywords: string[]
}

const EMPTY: Draft = { name: "", topic: "", description: "", socials: [...SOCIALS], keywords: [] }

export function ViralProjectDialog({
  open,
  folderId,
  folders = [],
  onClose,
  onCreated,
}: {
  open: boolean
  /** The folder a new project starts in: the one the list is showing. */
  folderId: string | null
  folders?: ViralFolderSummary[]
  onClose: () => void
  onCreated: (project: ViralProjectItem) => void
}) {
  const [draft, setDraft] = React.useState<Draft>(EMPTY)
  const [saving, setSaving] = React.useState(false)
  const [invalid, setInvalid] = React.useState<keyof Draft | null>(null)
  const [newFolderId, setNewFolderId] = React.useState(folderId)
  const [ideas, setIdeas] = React.useState<string[]>([])
  const [ideasBusy, setIdeasBusy] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Start empty every time the window opens.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDraft(EMPTY)
      setInvalid(null)
      setNewFolderId(folderId)
      setIdeas([])
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(EMPTY)
  const searches = draft.socials.some(socialHasKeywords)
  const set = (patch: Partial<Draft>) => {
    setDraft((was) => ({ ...was, ...patch }))
    setInvalid(null)
  }

  function refuse(field: keyof Draft, message: string) {
    setInvalid(field)
    showErrorToast(message)
    if (field === "name") inputRef.current?.focus()
  }

  function toggleSocial(social: Social, on: boolean) {
    set({ socials: on ? SOCIALS.filter((one) => one === social || draft.socials.includes(one)) : draft.socials.filter((one) => one !== social) })
  }

  async function suggest() {
    if (ideasBusy) return
    setIdeasBusy(true)
    dismissErrorToast()
    try {
      const answer = await suggestViralKeywords({
        description: [draft.topic, draft.description].filter((one) => one.trim()).join("\n"),
        existing: draft.keywords,
        projectId: null,
      })
      setIdeas(answer.ideas)
      if (!answer.ideas.length) toast.message("No new ideas came back. Say a little more about what you make.")
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setIdeasBusy(false)
    }
  }

  function toggleIdea(idea: string) {
    const has = draft.keywords.some((one) => one.toLowerCase() === idea.toLowerCase())
    set({
      keywords: has
        ? draft.keywords.filter((one) => one.toLowerCase() !== idea.toLowerCase())
        : [...draft.keywords, idea],
    })
  }

  async function create() {
    if (!draft.name.trim()) return refuse("name", "A project needs a name.")
    if (!draft.socials.length) return refuse("socials", "Tick at least one social.")
    setSaving(true)
    try {
      const created = await createViralProjectFn({
        name: draft.name,
        topic: draft.topic,
        description: draft.description,
        socials: draft.socials,
        keywords: searches ? draft.keywords : [],
        folderId: newFolderId,
      })
      dismissErrorToast()
      onCreated(created)
      onClose()
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              One niche to research. Nothing is searched until you press Search.
            </DialogDescription>
          </DialogHeader>
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
                  <CardTitle>The project</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="viral-project-name">Name</Label>
                    <Input
                      id="viral-project-name"
                      ref={inputRef}
                      value={draft.name}
                      maxLength={VIRAL_PROJECT_NAME_MAX}
                      aria-invalid={invalid === "name" || undefined}
                      placeholder="Meal prep"
                      onChange={(event) => set({ name: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="viral-project-topic"
                      hint="Analyse with AI rewrites each viral video as a script about this. For example: a meal-prep course for busy dads. You can change it for one video in the Analyse box."
                    >
                      Your topic
                    </FieldLabel>
                    <Input
                      id="viral-project-topic"
                      maxLength={ANALYSIS_TOPIC_MAX}
                      value={draft.topic}
                      placeholder="A meal-prep course for busy dads"
                      onChange={(event) => set({ topic: event.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="viral-project-description"
                      hint="A sentence or two about the niche. The AI reads it to suggest keywords and to judge how well each video fits."
                    >
                      Description
                    </FieldLabel>
                    <Textarea
                      id="viral-project-description"
                      rows={1}
                      maxLength={VIRAL_DESCRIPTION_MAX}
                      value={draft.description}
                      placeholder="Cheap, high-protein lunches made on Sunday for the week"
                      onChange={(event) => set({ description: event.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Socials</CardTitle>
                  <CardDescription>YouTube is searched by keyword and by creator. TikTok follows creators.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {SOCIALS.map((social) => (
                    <div key={social} className="flex items-center gap-2">
                      <Checkbox
                        id={`viral-project-social-${social}`}
                        checked={draft.socials.includes(social)}
                        aria-invalid={invalid === "socials" || undefined}
                        onCheckedChange={(checked) => toggleSocial(social, checked === true)}
                      />
                      <Label htmlFor={`viral-project-social-${social}`}>{SOCIAL_NAMES[social]}</Label>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {searches ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>YouTube keywords</CardTitle>
                    <CardDescription>
                      Optional. Each keyword is one YouTube search of {unitsPerKeyword("shorts")} units, out of 10,000
                      free a day.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="viral-project-keywords">Keywords</Label>
                      <KeywordChips
                        id="viral-project-keywords"
                        value={draft.keywords}
                        onChange={(keywords) => set({ keywords })}
                        invalid={invalid === "keywords"}
                      />
                    </div>
                    <div className="grid gap-2">
                      <div>
                        <Button type="button" variant="outline" disabled={ideasBusy} onClick={() => void suggest()}>
                          {ideasBusy ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                          Suggest keywords
                        </Button>
                      </div>
                      <KeywordIdeas ideas={ideas} picked={draft.keywords} onToggle={toggleIdea} />
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {folders.length ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Folder</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="viral-project-folder">Put it in</Label>
                      <Select
                        value={newFolderId ?? NO_FOLDER}
                        onValueChange={(value) => setNewFolderId(value === NO_FOLDER ? null : value)}
                      >
                        <SelectTrigger id="viral-project-folder" className="sm:w-60">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_FOLDER}>No folder</SelectItem>
                          {folders.map((folder) => (
                            <SelectItem key={folder.id} value={folder.id}>
                              {folder.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
