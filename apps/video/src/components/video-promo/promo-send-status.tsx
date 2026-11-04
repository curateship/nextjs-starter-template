import { ExternalLinkIcon, Loader2Icon, RotateCwIcon, SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { PromoSendView } from "@/lib/video/promo"

/**
 * Under an export's name: where it went in Promo (part 17). One line per
 * Promo project: on its way with how far it has got, sent with Open in
 * Promo, or not there with why and Try again (part 19).
 */
export function PromoSendStatusLine({
  sends,
  onRetry,
}: {
  sends: PromoSendView[]
  onRetry: (sendId: string) => void
}) {
  if (!sends.length) return null
  return (
    <div className="grid gap-0.5">
      {sends.map((send) => (
        <span key={send.id} className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          {send.status === "sending" ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              {send.kind === "slideshow" ? "Slideshow going" : "Sending"} to {send.promoProjectName}
              {send.progress ? `, ${Math.round(send.progress * 100)} out of 100` : "…"}
            </>
          ) : send.status === "sent" ? (
            <>
              <SendIcon className="size-3.5" />
              {send.kind === "slideshow" ? "Slideshow sent" : "Sent to Promo"} · {send.promoProjectName}
              {send.promoItemUrl ? (
                <a
                  href={send.promoItemUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-foreground underline-offset-2 hover:underline"
                >
                  Open in Promo
                  <ExternalLinkIcon className="size-3" />
                </a>
              ) : null}
            </>
          ) : (
            <>
              <span className="whitespace-normal text-destructive">
                {send.kind === "slideshow" ? "Slideshow didn't reach" : "Didn't reach"} {send.promoProjectName} · {send.error}
              </span>
              <Button type="button" variant="ghost" size="xs" onClick={() => onRetry(send.id)}>
                <RotateCwIcon className="size-3.5" />
                Try again
              </Button>
            </>
          )}
        </span>
      ))}
    </div>
  )
}
