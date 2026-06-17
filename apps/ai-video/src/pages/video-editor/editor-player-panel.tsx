import { EditorPreview } from "@/pages/video-editor/editor-preview"

// Center panel: the playback stage hosting the composed preview.
export function EditorPlayerPanel() {
  return (
    <section className="flex h-full w-full min-w-0 items-center justify-center overflow-hidden rounded-xl bg-black p-4">
      <EditorPreview />
    </section>
  )
}
