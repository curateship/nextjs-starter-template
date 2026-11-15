import type * as React from "react"

import type { PhoneKind } from "@/lib/phones/options"
import { cn } from "@/lib/utils"

/** Apple's logo (Simple Icons, CC0), in a 24 by 24 box. */
const APPLE =
  "M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"

/**
 * A phone drawn in outline, with Apple's logo or Android's robot in the
 * middle of its screen by the phone's kind (Tyler, 12 Nov 2026: "add a phone
 * graphic here with either an android icon or apple icon in the middle of
 * phone"): in the phones list where the slot number was ("put the phone icon
 * where the slot is"), and in the open phone's screen box while there is no
 * picture ("leave the icon on the right panel").
 */
export function PhoneGraphic({
  kind,
  className,
  children,
}: {
  kind: PhoneKind
  className?: string
  /**
   * Words drawn on the phone's own screen, under the logo: the open phone's
   * box says why there is no picture there, so the box is as tall as the
   * phone (Tyler, 12 Nov 2026: "have the size of the container as tall as the
   * phone").
   */
  children?: React.ReactNode
}) {
  const label = kind === "iphone" ? "An iPhone" : "An Android phone"
  if (!children) {
    return (
      <svg viewBox="0 0 120 220" role="img" aria-label={label} className={cn("h-40 w-auto", className)}>
        <PhoneBody />
        {/* The logo, 40 wide, in the middle of the screen. */}
        <g transform="translate(40 90) scale(1.6667)" className="fill-muted-foreground/70">
          <PhoneLogo kind={kind} />
        </g>
      </svg>
    )
  }
  return (
    <div className={cn("relative h-40 w-auto", className)} style={{ aspectRatio: "120 / 220" }}>
      <svg viewBox="0 0 120 220" role="img" aria-label={label} className="absolute inset-0 size-full">
        <PhoneBody />
      </svg>
      {/* Over the screen (12, 22, 96 by 176 of 120 by 220): the logo, then the words. */}
      <div className="absolute inset-x-[10%] top-[10%] bottom-[10%] flex flex-col items-center justify-center gap-3 px-2 text-center">
        <svg viewBox="0 0 24 24" aria-hidden className="size-10 shrink-0 fill-muted-foreground/70">
          <PhoneLogo kind={kind} />
        </svg>
        {children}
      </div>
    </div>
  )
}

/** The body, its screen and the speaker at the top, in a 120 by 220 box. */
function PhoneBody() {
  return (
    <>
      <rect x="4" y="4" width="112" height="212" rx="20" className="fill-card stroke-muted-foreground/40" strokeWidth="3" />
      <rect x="12" y="22" width="96" height="176" rx="8" className="fill-muted stroke-muted-foreground/20" strokeWidth="1.5" />
      <rect x="46" y="11" width="28" height="4" rx="2" className="fill-muted-foreground/40" />
    </>
  )
}

/** Apple's logo or Android's robot, in a 24 by 24 box. */
export function PhoneLogo({ kind }: { kind: PhoneKind }) {
  if (kind === "iphone") return <path d={APPLE} />
  return (
    // The robot's head is narrower than the logo, so it is drawn larger about its middle.
    <g transform="translate(12 12.8) scale(1.6) translate(-12 -12.8)">
      <path d="M5 17a7 7 0 0 1 14 0z" />
      <path d="M7.6 11.6 5.8 8.6M16.4 11.6l1.8-3" className="stroke-muted-foreground/70" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <circle cx="9.4" cy="14.2" r="0.9" className="fill-muted" />
      <circle cx="14.6" cy="14.2" r="0.9" className="fill-muted" />
    </g>
  )
}
