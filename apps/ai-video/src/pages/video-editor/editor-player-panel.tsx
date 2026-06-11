import { PlayIcon } from "lucide-react"

// Center panel: the playback stage. UI-only — renders an empty 16:9 canvas;
// the real player engine mounts here later. Transport controls live in the
// timeline toolbar, so the stage itself stays clean.
export function EditorPlayerPanel() {
  return (
    <section className="flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black p-4">
      {/* Height-driven 16:9 canvas; max-w clamps it on very narrow panels */}
      <div className="grid aspect-video h-full max-h-full w-auto max-w-full place-items-center rounded-md bg-black">
        <PlayIcon className="size-10 text-white/15" aria-hidden="true" />
      </div>
    </section>
  )
}
