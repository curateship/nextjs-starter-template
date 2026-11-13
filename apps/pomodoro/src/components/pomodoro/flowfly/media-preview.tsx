import { EyeIcon, MusicIcon } from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"

/**
 * The file itself at the top of an upload's or a generation's record on the
 * Flowfly dashboard (Tyler's pick "Upload with a preview"): the picture as
 * it is, a video playing silently on a loop, or a sound with the browser's
 * own play bar. A file that is gone says so.
 */
export function MediaPreview({ kind, url }: { kind: string | null; url: string | null }) {
  return (
    <PanelCard storageId="pomodoro-flowfly-preview" icon={<EyeIcon />} title="Preview">
      {!url ? (
        <p className="text-sm text-muted-foreground">The file is gone.</p>
      ) : kind === "image" ? (
        <img src={url} alt="" className="aspect-video w-full rounded-lg bg-muted object-cover" />
      ) : kind === "video" ? (
        <video src={url} muted loop autoPlay playsInline className="aspect-video w-full rounded-lg bg-muted object-cover" />
      ) : kind === "audio" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <span className="flex aspect-[3/1] w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <MusicIcon className="size-6" aria-hidden />
          </span>
          <audio src={url} controls preload="none" className="w-full" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No preview for this kind of file.</p>
      )}
    </PanelCard>
  )
}
