import {
  BlocksIcon,
  CreditCardIcon,
  HelpCircleIcon,
  ImagesIcon,
  MonitorIcon,
  PanelTopIcon,
  QuoteIcon,
  SeparatorHorizontalIcon,
  TypeIcon,
} from "lucide-react"

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { appFrontPageRowKinds } from "@/lib/app-options"
import type { AutomationNodeIcon } from "@/lib/automations/node-descriptor"
import {
  FRONT_PAGE_ROW_KIND_HINTS,
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_KINDS,
  type FrontPageRowKind,
} from "@/lib/pages/front-page"

/**
 * The prefix an app's key wears in a chosen value, the same one the row window
 * reads, so a picked card and a saved row say the kind the same way.
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
 * Choosing what a new front page row is, before the row exists.
 *
 * A row's kind decides which fields it has, so it is chosen once here and
 * never again: the row window has no way to change it. Picking a card creates
 * the row and opens it, so one click gets from Add row to typing.
 */
export function FrontPageRowPicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a row</DialogTitle>
          <DialogDescription>
            Pick what this row shows. A row keeps the kind it was made with, so
            its fields cannot change under what you typed.
          </DialogDescription>
        </DialogHeader>
        {/* The body, not a bare div: it carries the window's side and bottom
            padding and the scroll area a long list of kinds needs. */}
        <DialogBody className="gap-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {shellChoices.map((choice) => (
              <RowKindCard key={choice.value} choice={choice} onPick={onPick} />
            ))}
          </div>
          {appChoices.length ? (
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">This app's own rows</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {appChoices.map((choice) => (
                  <RowKindCard
                    key={choice.value}
                    choice={choice}
                    onPick={onPick}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function RowKindCard({
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
      className="flex items-start gap-3 rounded-md border bg-background p-3 text-left hover:bg-muted"
      onClick={() => onPick(choice.value)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="grid gap-1">
        <span className="text-sm font-medium">{choice.label}</span>
        <span className="text-xs text-muted-foreground">{choice.hint}</span>
      </span>
    </button>
  )
}
