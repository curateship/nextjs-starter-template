import type * as React from "react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * A picture lying faintly behind the top of a panel and fading into it, the
 * way Project's banner does, so the header still reads over it. The trip's
 * cover uses it in the left panel, and the open activity's picture in the
 * right (task "Misc": "Put the image into the background blended in like how
 * we did for left panel").
 */
export function BlendedBanner({ url, onBroken }: { url: string; onBroken?: () => void }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 overflow-hidden">
      <img src={url} alt="" className="size-full object-cover opacity-30" onError={onBroken} />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-card/40 to-card" />
    </div>
  )
}

/** An icon button in a panel's header, named and with the shared tooltip. */
export function HeaderButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  /** For a button that shows or hides something, whether it's showing. */
  pressed?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} aria-pressed={pressed} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
