"use client"

import { ChevronRightIcon } from "lucide-react"
import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/hooks/use-mobile"
import { renderShellIcon } from "@/lib/custom-shell"
import type { HeaderBreadcrumbStep } from "@/lib/nav/header-breadcrumb"
import { toLinkProps } from "@/lib/nav/nav-href"
import { cn } from "@/lib/utils"

/** A step drawn in the row, or the "…" that holds the folded middle. */
type Slot =
  | { kind: "step"; step: HeaderBreadcrumbStep; index: number }
  | { kind: "folded"; steps: HeaderBreadcrumbStep[] }

function StepBody({
  step,
  index,
}: {
  step: HeaderBreadcrumbStep
  index: number
}) {
  return (
    <>
      {/* Only the first step wears its icon, the way the sidebar section it
          names does. An icon on every step makes the trail read as buttons. */}
      {index === 0 && step.icon ? (
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          {renderShellIcon(step.icon, "h-3.5 w-3.5")}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{step.label}</span>
    </>
  )
}

/**
 * The header's "where you are" trail, for the Breadcrumb choice of Top left
 * shows. Every step but the last is a link. On a phone a trail of three or
 * more keeps its first and last steps and folds the rest into a "…" menu.
 */
export function StickyHeaderBreadcrumb({
  steps,
}: {
  steps: HeaderBreadcrumbStep[]
}) {
  const isMobile = useIsMobile()
  if (!steps.length) return null

  const slots: Slot[] =
    isMobile && steps.length > 2
      ? [
          { kind: "step", step: steps[0], index: 0 },
          { kind: "folded", steps: steps.slice(1, -1) },
          { kind: "step", step: steps.at(-1)!, index: steps.length - 1 },
        ]
      : steps.map((step, index) => ({ kind: "step", step, index }))

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex h-8 min-w-0 items-center gap-1 text-sm">
        {slots.map((slot, position) => {
          const last = position === slots.length - 1
          return (
            <li
              key={slot.kind === "step" ? `${slot.index}` : "folded"}
              className={cn(
                "flex min-w-0 items-center gap-1",
                // The page you are on gives way last, so it is the step that
                // keeps its name when the row runs short.
                last ? "shrink" : "shrink-[2]"
              )}
            >
              {position > 0 ? (
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              ) : null}
              {slot.kind === "folded" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        slot.steps.length === 1
                          ? "1 more step"
                          : `${slot.steps.length} more steps`
                      }
                    >
                      …
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-auto min-w-40">
                    {slot.steps.map((step, index) =>
                      step.href ? (
                        <DropdownMenuItem
                          key={`${step.href}-${index}`}
                          asChild
                        >
                          <Link {...toLinkProps(step.href)}>{step.label}</Link>
                        </DropdownMenuItem>
                      ) : null
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : slot.step.href ? (
                <Link
                  {...toLinkProps(slot.step.href)}
                  className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <StepBody step={slot.step} index={slot.index} />
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="inline-flex h-8 min-w-0 items-center gap-1.5 px-2 font-medium text-foreground"
                >
                  <StepBody step={slot.step} index={slot.index} />
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
