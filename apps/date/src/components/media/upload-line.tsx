import * as React from "react"
import { PauseIcon, PlayIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  cancelUpload,
  pauseUpload,
  resumeUpload,
  useQueuedUploads,
  type QueuedUpload,
} from "@/lib/media/upload-queue"
import { speedText, timeLeftText } from "@/lib/media/upload-speed"

/**
 * "Uploading beach.mov, 42%, about 18 minutes left at 12 MB/s". The time left
 * and the speed join in once two seconds of speed say something; a picture
 * or a sound file, which goes in one request, shows no number at all.
 */
function uploadLineText(upload: QueuedUpload) {
  const percent = Math.floor(upload.fraction * 100)
  if (upload.paused) return `Paused ${upload.name} at ${percent}%`
  if (!upload.pausable) return `Uploading ${upload.name}`
  const left = timeLeftText(
    upload.size * (1 - upload.fraction),
    upload.bytesPerSecond
  )
  const speed = speedText(upload.bytesPerSecond)
  return left && speed
    ? `Uploading ${upload.name}, ${percent}%, ${left} at ${speed}`
    : `Uploading ${upload.name}, ${percent}%`
}

/**
 * The upload line in the bottom corner of every signed-in page, one row per
 * file going up, with Pause and Cancel. It is drawn by the shell layout, so
 * moving to another page leaves it, and the uploads, where they are.
 * Closing the tab asks first while anything is going up.
 */
export function UploadLine() {
  const uploads = useQueuedUploads()
  const busy = uploads.length > 0

  React.useEffect(() => {
    if (!busy) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [busy])

  if (!busy) return null
  return (
    <div
      className="fixed right-4 bottom-4 z-40 grid w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border bg-popover p-2.5 text-sm text-popover-foreground shadow-md"
      role="status"
      aria-label="Uploads"
    >
      {uploads.map((upload) => (
        <UploadRow key={upload.id} upload={upload} />
      ))}
    </div>
  )
}

function UploadRow({ upload }: { upload: QueuedUpload }) {
  const percent = Math.floor(upload.fraction * 100)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate tabular-nums">
          {uploadLineText(upload)}
        </span>
        {/* Videos only: a picture or a sound file goes in one short request
            that cannot be paused or stopped part way. */}
        {upload.pausable ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={upload.paused ? `Resume ${upload.name}` : `Pause ${upload.name}`}
                  onClick={() =>
                    upload.paused ? resumeUpload(upload.id) : pauseUpload(upload.id)
                  }
                >
                  {upload.paused ? <PlayIcon /> : <PauseIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{upload.paused ? "Resume" : "Pause"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Cancel ${upload.name}`}
                  onClick={() => cancelUpload(upload.id)}
                >
                  <XIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cancel upload</TooltipContent>
            </Tooltip>
          </>
        ) : null}
      </div>
      {upload.pausable ? (
        <div
          className="h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${upload.name} uploaded`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div
            className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}
