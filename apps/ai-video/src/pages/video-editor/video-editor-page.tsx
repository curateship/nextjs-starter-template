import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { EditorMediaPanel } from "@/pages/video-editor/editor-media-panel"
import { EditorPlayerPanel } from "@/pages/video-editor/editor-player-panel"
import { EditorSettingsPanel } from "@/pages/video-editor/editor-settings-panel"
import { EditorTimeline } from "@/pages/video-editor/editor-timeline"

// Video editor dashboard (UI-only): three panel cards over a height-resizable
// timeline strip. The shell strips its content padding for this route, so the
// page owns the full area under the sticky header.
export function VideoEditorPage() {
  return (
    <ResizablePanelGroup orientation="vertical" className="h-full">
      {/* Panels area; px min keeps the cards usable at any viewport height */}
      <ResizablePanel defaultSize="62%" minSize="220px">
        {/* Mirrors the shell's default content spacing (DashboardContent /
            DashboardRow), which this route strips for the full-bleed timeline */}
        <div className="flex h-full min-h-0 gap-4 p-3 sm:gap-6 sm:p-4 md:p-6">
          <EditorMediaPanel />
          <EditorPlayerPanel />
          <EditorSettingsPanel />
        </div>
      </ResizablePanel>

      {/* Drag handle: resizes the timeline height per the mock */}
      <ResizableHandle withHandle />

      <ResizablePanel defaultSize="38%" minSize="150px" maxSize="65%">
        <EditorTimeline />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
