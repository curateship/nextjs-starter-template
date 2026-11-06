import * as React from "react"
import {
  LanguagesIcon,
  SparklesIcon,
  ClapperboardIcon,
  type LucideIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TranslateDialog } from "@/components/video-editor/translate-dialog"
import { TeaserDialog } from "@/components/video-editor/teaser-dialog"
import { ToolTile } from "@/components/video-editor/tool-tile"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import {
  loadAiToolsAvailability,
  type AiToolsAvailability,
} from "@/lib/api/video/ai-tools"

/**
 * The AI panel: a tile for each thing the app can do to a project. Brief to
 * video and the Script tile moved to the Templates panel on 5 Nov 2026
 * (workspace/docs/templates.md). Voice moved to the + in the Voices panel
 * on the same day, beside recording your own (saved-voiceovers.md), B-roll
 * was removed, and Captions and Tighten moved to the Transcript panel, which
 * works from the same words (Tyler: "caption and transcript should be in the
 * transcript panel"). Hook, which rewrote the opening line three ways, was
 * removed that day too.
 *
 * One press each, laid out the way the old app laid them out, because that is
 * what these are — a button you press, not a form you fill in. Each one works
 * out for itself which part of the project it is about, and undo takes any of
 * them back.
 */

type ToolId =
  | "translate"
  | "teaser"

const TOOLS: {
  id: ToolId
  label: string
  description: string
  Icon: LucideIcon
}[] = [
  {
    id: "translate",
    label: "Another language",
    description: "Translate the talking, then caption it or have it read aloud.",
    Icon: LanguagesIcon,
  },
  {
    id: "teaser",
    label: "Teaser",
    description: "The best 1 to 3 second moments, cut on the beat, at the start.",
    Icon: ClapperboardIcon,
  },
]

export function AiPanel() {
  const { store } = useEditorRuntime()
  const [available, setAvailable] = React.useState<AiToolsAvailability | null>(
    null
  )
  const [translateOpen, setTranslateOpen] = React.useState(false)
  const [teaserOpen, setTeaserOpen] = React.useState(false)

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
    // Every tool here ends by changing the timeline, and most cost credits on
    // the way, so a locked window stops them before they start.
    if (store.refuseIfLocked()) return
    if (id === "translate") setTranslateOpen(true)
    if (id === "teaser") setTeaserOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<SparklesIcon className="size-4" />}
        title="AI tools"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <div className="grid gap-3">
            {TOOLS.map(({ id, label, description, Icon }) => (
              <ToolTile
                key={id}
                label={label}
                description={description}
                Icon={Icon}
                onPress={() => press(id)}
              />
            ))}
          </div>
        </div>
      </ScrollArea>

      <TranslateDialog
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        available={available}
      />
      <TeaserDialog open={teaserOpen} onOpenChange={setTeaserOpen} />
    </div>
  )
}
