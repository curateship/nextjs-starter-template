import * as React from "react"
import { LayoutTemplateIcon } from "lucide-react"

import { FoldingMenu } from "@/components/shared/folding-menu"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { TemplateEditor } from "@/components/video-templates/template-menu"
import {
  pickTemplate,
  useTemplatePick,
  useTemplates,
  useWriter,
} from "@/components/video-templates/template-store"
import { VideoTemplateFields } from "@/components/video-templates/templates-panel"
import {
  getTemplateErrorMessage,
  loadVideoTemplateCard,
  saveVideoTemplateCard,
  type VideoTemplateCard,
} from "@/lib/api/video/templates"
import { withChanges } from "@/lib/video/templates"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The video's template, as a button in the editor's header between Share and
 * Export, showing the template's name (Tyler, 5 Nov 2026: "move that into a
 * dropdown here ... with a button dropdown with the name of the template
 * showing").
 *
 * Everything in it is for this video only (Tyler, 5 Nov 2026: "changing
 * anything in the dropdown is ONLY for the the currant video ... selecting a
 * template is just applying the parameters to the currant video"). The
 * template itself changes only from its cog in the Templates panel.
 *
 * The dropdown is the shell's folding menu holding the video's own fields:
 * the template picked, My script or Write it for me, the script box, Pick
 * the hook, Hear it and this video's own changes, with Generate video in a
 * footer that stays at the foot ("add a sticky footer with the "Generate
 * video" button"). This video's own copy of the template's settings, the
 * rows the template's cog opens less its name, references and Try it, is
 * behind a cog beside the picker and opens in a window ("All of these should be open via a settings cog here clicking on
 * it opens a modal"), without Pin, Duplicate and Delete ("remove these
 * buttons in the dropdown"). The pick is shared with the Templates panel
 * through one store, so a change in either shows in both at once
 * (templates.md).
 */
export function TemplateHeaderMenu() {
  const { videoId } = useEditorRuntime()
  const templates = useTemplates()
  const picked = useTemplatePick(videoId)
  const template = templates?.find((one) => one.id === picked) ?? null
  const writer = useWriter()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [card, setCard] = React.useState<VideoTemplateCard | null>(null)

  // The script box and this video's changes, read fresh each time it opens,
  // so what was typed in another window shows.
  React.useEffect(() => {
    if (!open) return
    let active = true
    loadVideoTemplateCard(videoId)
      .then((loaded) => {
        if (active) setCard(loaded)
      })
      .catch((error: unknown) => showErrorToast(getTemplateErrorMessage(error)))
    return () => {
      active = false
    }
  }, [open, videoId])

  const shown = card && card.video_id === videoId ? card : null
  // The window edits this video's own copy of the settings, never the template.
  const videoCopy = template && shown ? { ...template, fields: withChanges(template.fields, shown.changes) } : null

  /** Picking copies the template's settings onto this video; the card is read again to show them. */
  async function pick(templateId: string | null) {
    await pickTemplate(videoId, templateId)
    try {
      setCard(await loadVideoTemplateCard(videoId))
    } catch (error) {
      showErrorToast(getTemplateErrorMessage(error))
    }
  }

  return (
    <>
      <FoldingMenu
        label="This video's template"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Button type="button" variant="outline" className="max-w-48 min-w-0">
            <LayoutTemplateIcon />
            <span className="truncate">{template?.name ?? "Template"}</span>
          </Button>
        }
      >
        {shown && templates ? (
          <VideoTemplateFields
            card={shown}
            pickedId={picked ?? null}
            templates={templates}
            writer={writer}
            onPick={(templateId) => void pick(templateId)}
            onCard={setCard}
            onEditTemplate={() => setEditing(true)}
          />
        ) : null}
      </FoldingMenu>

      <Dialog open={editing && !!videoCopy} onOpenChange={setEditing}>
        {videoCopy ? (
          <DialogContent variant="admin" className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>This video&apos;s settings</DialogTitle>
              <DialogDescription>
                Copied from the {videoCopy.name} template when it was picked. Changes here are for this video
                only; the template stays as it was. Each change saves itself.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <TemplateEditor
                key={`${videoId}:${videoCopy.id}`}
                template={videoCopy}
                writer={writer}
                active={editing}
                actions={false}
                look="cards"
                forVideo={{
                  save: async (fields) => {
                    setCard(await saveVideoTemplateCard({ videoId, changes: fields }))
                  },
                }}
                onSaved={() => undefined}
                onDuplicated={() => undefined}
                onDeleted={() => undefined}
              />
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={() => setEditing(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
