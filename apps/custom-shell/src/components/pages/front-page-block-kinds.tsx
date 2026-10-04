import {
  BlocksIcon,
  CreditCardIcon,
  HelpCircleIcon,
  ImagesIcon,
  LayoutGridIcon,
  MonitorIcon,
  PanelTopIcon,
  QuoteIcon,
  SeparatorHorizontalIcon,
  TypeIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { appFrontPageRowKinds } from "@/lib/app-options"
import type { AutomationNodeIcon } from "@/lib/automations/node-descriptor"
import { focusRingInset } from "@/lib/layout/focus-ring"
import {
  FRONT_PAGE_ROW_KIND_HINTS,
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_KINDS,
  type FrontPageRowKind,
} from "@/lib/pages/front-page"
import { cn } from "@/lib/utils"

/**
 * The prefix an app's key wears in a chosen value, the same one the block
 * inspector reads, so a picked card and a saved block say the kind the same
 * way.
 */
export const APP_KIND_PREFIX = "app:"

/**
 * The picture on each card. Lives here rather than beside the labels in
 * `lib/pages/front-page.ts`, because that module is read on the server too and
 * an icon is a React component.
 */
const KIND_ICONS: Record<FrontPageRowKind, AutomationNodeIcon> = {
  text: TypeIcon,
  hero: PanelTopIcon,
  plans: CreditCardIcon,
  testimonials: QuoteIcon,
  faq: HelpCircleIcon,
  logos: ImagesIcon,
  screenshots: MonitorIcon,
  divider: SeparatorHorizontalIcon,
}

type Choice = {
  value: string
  label: string
  hint: string
  icon: AutomationNodeIcon
}

/**
 * The left panel of the front page editor: every kind of block this page may
 * hold, as a card each.
 *
 * A block's kind decides which fields it has, so it is chosen once here and
 * never again — the inspector has no way to change it. Clicking a card makes
 * the block and selects it, so one click gets from here to typing.
 */
export function FrontPageBlockKinds({
  onPick,
}: {
  onPick: (choice: string) => void
}) {
  const shellChoices: Choice[] = FRONT_PAGE_ROW_KINDS.map((kind) => ({
    value: kind,
    label: FRONT_PAGE_ROW_KIND_LABELS[kind],
    hint: FRONT_PAGE_ROW_KIND_HINTS[kind],
    icon: KIND_ICONS[kind],
  }))
  // An app's own kinds, after the shell's, in the order the app wrote them. A
  // kind that named no icon gets the plain block, so a card is never empty.
  const appChoices: Choice[] = appFrontPageRowKinds().map((kind) => ({
    value: `${APP_KIND_PREFIX}${kind.key}`,
    label: kind.label,
    hint: kind.hint,
    icon: kind.icon ?? BlocksIcon,
  }))

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<LayoutGridIcon className="size-4" />}
        title="Add a block"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          <div className="grid gap-2">
            {shellChoices.map((choice) => (
              <BlockKindCard
                key={choice.value}
                choice={choice}
                onPick={onPick}
              />
            ))}
          </div>
          {appChoices.length ? (
            <section aria-labelledby="front-page-app-kinds">
              <h3
                id="front-page-app-kinds"
                className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                This app's own blocks
              </h3>
              <div className="grid gap-2">
                {appChoices.map((choice) => (
                  <BlockKindCard
                    key={choice.value}
                    choice={choice}
                    onPick={onPick}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function BlockKindCard({
  choice,
  onPick,
}: {
  choice: Choice
  onPick: (choice: string) => void
}) {
  const Icon = choice.icon

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start gap-2 overflow-hidden rounded-lg border bg-card p-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/30",
        focusRingInset
      )}
      onClick={() => onPick(choice.value)}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <span className="grid min-w-0 gap-1">
        <span className="truncate text-sm font-medium">{choice.label}</span>
        <span className="text-xs text-muted-foreground">{choice.hint}</span>
      </span>
    </button>
  )
}
