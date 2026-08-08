import * as React from "react"
import {
  CaptionsIcon,
  FileTextIcon,
  MicIcon,
  PenLineIcon,
  ScissorsIcon,
  SparklesIcon,
  SplitIcon,
  type LucideIcon,
} from "lucide-react"

import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CaptionsDialog } from "@/components/video-editor/captions-dialog"
import { HookDialog } from "@/components/video-editor/hook-dialog"
import { JumpCutsDialog } from "@/components/video-editor/jump-cuts-dialog"
import { VoiceDialog } from "@/components/video-editor/voice-dialog"
import {
  loadAiToolsAvailability,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"
import { focusRingInset } from "@/lib/layout/focus-ring"
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

const TOOLS: {
  id: ToolId
  label: string
  description: string
  Icon: LucideIcon
}[] = [
  {
    id: "captions",
    label: "Captions",
    description: "Write down the talking and lay it over the picture.",
    Icon: CaptionsIcon,
  },
  {
    id: "jump-cut",
    label: "Tighten",
    description: "Take out the dead air, and the \u201cum\u201ds if you want.",
    Icon: ScissorsIcon,
  },
  {
    id: "voice",
    label: "Voice",
    description: "Read a script aloud and drop it on the timeline.",
    Icon: MicIcon,
  },
  {
    id: "hook",
    label: "Hook",
    description: "Rewrite the opening line three ways.",
    Icon: SplitIcon,
  },
  {
    id: "script",
    label: "Script",
    description: "Write the script from an idea.",
    Icon: PenLineIcon,
  },
  {
    id: "brief",
    label: "Brief to reel",
    description: "Turn a brief into a whole reel.",
    Icon: FileTextIcon,
  },
]

/** The ones that are built. The rest show as what is coming, greyed out. */
const BUILT: ToolId[] = ["captions", "jump-cut", "voice", "hook"]

export function AiPanel() {
  const [available, setAvailable] = React.useState<AiToolsAvailability | null>(
    null
  )
  const [captionsOpen, setCaptionsOpen] = React.useState(false)
  const [cutsOpen, setCutsOpen] = React.useState(false)
  const [voiceOpen, setVoiceOpen] = React.useState(false)
  const [hookOpen, setHookOpen] = React.useState(false)

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

  function press(id: ToolId) {
    if (id === "captions") setCaptionsOpen(true)
    if (id === "jump-cut") setCutsOpen(true)
    if (id === "voice") setVoiceOpen(true)
    if (id === "hook") setHookOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<SparklesIcon className="size-4" />}
        title="AI"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-4">
          <div className="grid gap-2">
            {TOOLS.map(({ id, label, description, Icon }) => {
              const ready = BUILT.includes(id)
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!ready}
                  onClick={() => press(id)}
                  title={ready ? undefined : "Not built yet"}
                  className={cn(
                    "flex w-full items-start gap-2 overflow-hidden rounded-lg border border-foreground/5 bg-card p-2 text-left transition-colors",
                    ready
                      ? "hover:border-primary/40 hover:bg-muted/30"
                      : "text-muted-foreground",
                    focusRingInset
                  )}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate text-xs font-medium">
                      {label}
                    </span>
                    <span className="line-clamp-2 text-[10px] leading-4 text-muted-foreground">
                      {ready ? description : "Not built yet."}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </ScrollArea>

      <CaptionsDialog
        open={captionsOpen}
        onOpenChange={setCaptionsOpen}
        available={available}
      />
      <JumpCutsDialog
        open={cutsOpen}
        onOpenChange={setCutsOpen}
        canUseWords={available?.words || available?.openai || false}
        available={available}
      />
      <VoiceDialog open={voiceOpen} onOpenChange={setVoiceOpen} />
      <HookDialog
        open={hookOpen}
        onOpenChange={setHookOpen}
        available={available}
      />
    </div>
  )
}
