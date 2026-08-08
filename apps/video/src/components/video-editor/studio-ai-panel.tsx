import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CaptionsIcon,
  FileTextIcon,
  Loader2Icon,
  MicIcon,
  PenLineIcon,
  ScissorsIcon,
  SparklesIcon,
  SplitIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { JumpCutsDialog } from "@/components/video-editor/jump-cuts-dialog"
import {
  getAiToolErrorMessage,
  loadAiToolsAvailability,
  writeCaptions,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { CAPTION_DEFAULTS, captionClipName } from "@/lib/video/captions"
import { editorId } from "@/lib/video/timeline-utils"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

/**
 * The AI panel: a tile for each thing the app can do to a project.
 *
 * One press each, laid out the way the old app laid them out, because that is
 * what these are — a button you press, not a form you fill in. Each one works
 * out for itself which part of the project it is about, and undo takes any of
 * them back.
 */

type ToolId = "captions" | "jump-cut" | "voice" | "hook" | "script" | "brief"

const TILES: { id: ToolId; label: string; Icon: LucideIcon }[] = [
  { id: "captions", label: "Captions", Icon: CaptionsIcon },
  { id: "jump-cut", label: "Tighten", Icon: ScissorsIcon },
  { id: "voice", label: "Voice", Icon: MicIcon },
  { id: "hook", label: "Hook", Icon: SplitIcon },
  { id: "script", label: "Script", Icon: PenLineIcon },
  { id: "brief", label: "Brief to reel", Icon: FileTextIcon },
]

/** The ones that are built. The rest show as what is coming, greyed out. */
const BUILT: ToolId[] = ["captions", "jump-cut"]

export function AiPanel() {
  const { projectId, dispatch } = useEditorRuntime()
  const [available, setAvailable] = React.useState<AiToolsAvailability | null>(
    null
  )
  const [busy, setBusy] = React.useState<ToolId | null>(null)
  const [cutsOpen, setCutsOpen] = React.useState(false)

  React.useEffect(() => {
    let active = true
    loadAiToolsAvailability()
      .then((loaded) => {
        if (active) setAvailable(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  async function handleCaptions() {
    setBusy("captions")
    try {
      const { captions } = await writeCaptions(projectId)
      dispatch({
        type: "INSERT_CAPTIONS",
        captions: captions.map((line) => ({
          id: editorId(),
          kind: "text" as const,
          name: captionClipName(line.text),
          text: line.text,
          fontId: "inter" as const,
          startMs: line.startMs,
          durationMs: line.endMs - line.startMs,
          trimStartMs: 0,
          fontSize: CAPTION_DEFAULTS.fontSize,
          color: CAPTION_DEFAULTS.color,
          highlightColor: CAPTION_DEFAULTS.backgroundColor,
          x: CAPTION_DEFAULTS.x,
          y: CAPTION_DEFAULTS.y,
        })),
      })
      dismissErrorToast()
      toast.success(
        `${captions.length} ${plural(captions.length, "caption", "captions")} added. Undo takes them all back off.`
      )
    } catch (error) {
      showErrorToast(getAiToolErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  function press(id: ToolId) {
    if (id === "captions") void handleCaptions()
    if (id === "jump-cut") setCutsOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<SparklesIcon className="size-4" />}
        title="AI"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">
            Each of these works out for itself which part of the project it is
            about. Undo takes any of them back.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TILES.map(({ id, label, Icon }) => {
              const ready = BUILT.includes(id)
              const running = busy === id
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!ready || busy !== null}
                  onClick={() => press(id)}
                  title={ready ? undefined : "Not built yet"}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border transition-colors",
                    ready
                      ? "border-foreground/10 hover:border-foreground/25 hover:bg-muted"
                      : "border-dashed border-foreground/10 text-muted-foreground",
                    busy !== null && !running ? "opacity-60" : null
                  )}
                >
                  {running ? (
                    <Loader2Icon className="size-5 animate-spin" />
                  ) : (
                    <Icon className="size-5" />
                  )}
                  <span className="text-sm font-medium">{label}</span>
                </button>
              )
            })}
          </div>
          {available !== null && !available.words ? (
            <p className="text-sm text-muted-foreground">
              Captions and filler words need a Google Gemini key.{" "}
              <Link
                to="/admin/settings/$tab"
                params={{ tab: "ai" }}
                className="underline underline-offset-2"
              >
                Add one in Settings
              </Link>
              . Cutting dead air works without one.
            </p>
          ) : null}
        </div>
      </ScrollArea>

      <JumpCutsDialog
        open={cutsOpen}
        onOpenChange={setCutsOpen}
        canUseWords={available?.words ?? false}
      />
    </div>
  )
}
