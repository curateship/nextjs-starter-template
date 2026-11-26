import * as React from "react"
import { Maximize2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * A picture Flow made, filling the width it is given; a press opens it full
 * size in a window (Tyler, 25 Nov 2026: "It should fill the box and if I
 * click on it, it should open fullsize in a modal").
 */
export function FlowPicture({ url, name, className }: { url: string; name: string; className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={`Open ${name} full size`}
        className={className ?? "block w-full cursor-zoom-in overflow-hidden rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"}
        onClick={() => setOpen(true)}
      >
        <img src={url} alt={name} className="block h-auto w-full" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent variant="admin" className="data-[variant=admin]:sm:w-[min(94vw,1600px)] data-[variant=admin]:sm:max-w-[min(94vw,1600px)]">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>Full size, as it is saved in your Media.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <img src={url} alt={name} className="mx-auto block h-auto max-h-[calc(100vh-15rem)] w-auto max-w-full rounded-lg" />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * A video Flow was given or made, such as an AI clip, playing where it is
 * with its own controls; the corner button opens it full size in the same
 * window as a picture (task 04: "opens full size like a picture"). `wide`
 * fills the width at the video's own shape; otherwise it sits in a 16:9 tile.
 */
export function FlowVideo({ url, name, wide = false }: { url: string; name: string; wide?: boolean }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <div className={wide ? "relative overflow-hidden rounded-lg bg-muted" : "relative aspect-video overflow-hidden rounded-lg bg-muted"}>
        {/* As the editor's tiles: only the start of the smooth copy is read,
            for its length and first frame; the rest streams when played. */}
        <video
          controls
          preload="metadata"
          playsInline
          src={url}
          className={wide ? "block h-auto w-full" : "size-full object-contain"}
          aria-label={name}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              aria-label={`Open ${name} full size`}
              className="absolute top-2 right-2"
              onClick={() => setOpen(true)}
            >
              <Maximize2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open full size</TooltipContent>
        </Tooltip>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent variant="admin" className="data-[variant=admin]:sm:w-[min(94vw,1600px)] data-[variant=admin]:sm:max-w-[min(94vw,1600px)]">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>Full size, as it is saved in your Media.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <video
              controls
              autoPlay
              loop
              playsInline
              src={url}
              aria-label={name}
              className="mx-auto block h-auto max-h-[calc(100vh-15rem)] w-auto max-w-full rounded-lg"
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
