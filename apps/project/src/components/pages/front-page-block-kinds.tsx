import {
  AlignLeftIcon,
  BlocksIcon,
  CreditCardIcon,
  FilesIcon,
  HelpCircleIcon,
  ImagesIcon,
  LayoutGridIcon,
  MonitorIcon,
  PanelTopIcon,
  PlusIcon,
  QuoteIcon,
  SeparatorHorizontalIcon,
  TypeIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { appFrontPageRowKinds } from "@/lib/app-options"
import type { AutomationNodeIcon } from "@/lib/automations/node-descriptor"
import { focusRing } from "@/lib/layout/focus-ring"
import { FRONT_PAGE_PATH } from "@/lib/pages/page-descriptor"
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
 * What a dragged kind card carries, under a type of its own so a drop can tell
 * one from a file or a selection dragged in from somewhere else.
 */
export const BLOCK_KIND_MEDIA_TYPE = "application/x-custom-shell-block-kind"

/**
 * The picture on each card. Lives here rather than beside the labels in
 * `lib/pages/front-page.ts`, because that module is read on the server too and
 * an icon is a React component.
 */
const KIND_ICONS: Record<FrontPageRowKind, AutomationNodeIcon> = {
  text: TypeIcon,
  words: AlignLeftIcon,
  hero: PanelTopIcon,
  plans: CreditCardIcon,
  testimonials: QuoteIcon,
  faq: HelpCircleIcon,
  logos: ImagesIcon,
  screenshots: MonitorIcon,
  pages: FilesIcon,
  divider: SeparatorHorizontalIcon,
}

/**
 * The picture for each kind the shell owns, for anything outside this file that
 * draws a block: the list beside the editor reads it so a block carries the
 * picture it was picked by.
 *
 * Exported as the map rather than as a `iconFor(block)` function on purpose. A
 * function that returns a component is a component built during render, which
 * is both a lint error and a real remount on every keystroke. Reading a
 * property is neither.
 */
export const FRONT_PAGE_BLOCK_ICONS: Readonly<
  Record<FrontPageRowKind, AutomationNodeIcon>
> = KIND_ICONS

/** What a block whose kind nobody recognises is drawn with. */
export const FRONT_PAGE_BLOCK_FALLBACK_ICON: AutomationNodeIcon = BlocksIcon

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
 * never again: the inspector has no way to change it.
 *
 * **A card is dragged into the middle panel, or added with the plus that
 * appears on it.** Clicking the card itself does nothing. It used to add a
 * block, and Tyler had that taken off on 5 Oct 2026: a list of cards you read
 * by pointing at them is a list that should not be building a page while you
 * read it. The same shape as the automation palette, which this follows.
 */
export function FrontPageBlockKinds({
  path,
  onPick,
  onDragKind,
}: {
  /** The page being built, which decides the kinds it may hold. */
  path: string
  onPick: (choice: string) => void
  /**
   * What is being carried, by name, or null once it is let go.
   *
   * The name cannot travel on the drag itself: a browser hands
   * `dataTransfer.getData` back empty until the drop, so the list would have
   * nothing to call the gap it is opening. Both panels are in one React tree,
   * so it is passed up instead.
   */
  onDragKind: (label: string | null) => void
}) {
  const shellChoices: Choice[] = FRONT_PAGE_ROW_KINDS
    // Plans is the front page's own. It needs the public prices and the
    // machinery to offer them, which the front page loads and no other page
    // does, so offering it elsewhere would be a card that adds a block drawing
    // nothing.
    .filter((kind) => kind !== "plans" || path === FRONT_PAGE_PATH)
    .map((kind) => ({
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
                onDragKind={onDragKind}
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
                    onDragKind={onDragKind}
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

/**
 * One kind, as a card you can click or drag.
 *
 * Both, not one or the other: clicking is the quick way and lands the block at
 * the end, and dragging is how it lands between two blocks that are already
 * there.
 *
 * **The browser's own drag, not dnd-kit's**, which is how the automation
 * palette does it. The blocks beside it are reordered with dnd-kit, and one
 * dnd-kit context holding both a sortable list and a card dragged in from
 * outside makes the whole list one drop target: the reorder then has no row to
 * land on and does nothing. The two kinds of drag have nothing to say to each
 * other, so they use two mechanisms and never meet.
 */
function BlockKindCard({
  choice,
  onPick,
  onDragKind,
}: {
  choice: Choice
  onPick: (choice: string) => void
  onDragKind: (label: string | null) => void
}) {
  const Icon = choice.icon

  return (
    <div className="group relative">
      <div
        draggable
        className={cn(
          // The clip-path is what keeps the corners round while the card is
          // being dragged. The picture the browser takes of a dragged element
          // is its box, square, with the rounded border painted inside it, so
          // without this the card grows four grey corners the moment it is
          // picked up. The automation palette carries the same line.
          "flex w-full cursor-grab items-start gap-2 overflow-hidden rounded-lg border bg-card p-2 pr-10 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 active:cursor-grabbing active:[clip-path:inset(0_round_var(--radius-lg))]"
        )}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "copy"
          // The kind travels as the drag's own payload. `text/plain` as well,
          // because a drag with nothing in it is one some browsers refuse to
          // start at all.
          event.dataTransfer.setData(BLOCK_KIND_MEDIA_TYPE, choice.value)
          event.dataTransfer.setData("text/plain", choice.label)
          onDragKind(choice.label)
        }}
        onDragEnd={() => onDragKind(null)}
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-3.5" />
        </span>
        <span className="grid min-w-0 gap-1">
          <span className="truncate text-sm font-medium">{choice.label}</span>
          <span className="text-xs text-muted-foreground">{choice.hint}</span>
        </span>
      </div>
      {/* The way in that is not a drag. The card itself does nothing when it
          is clicked — Tyler's call on 5 Oct 2026, because a card that adds a
          block the moment it is brushed is a card nobody can read. This button
          is also the keyboard's way in, since a drag has none. */}
      <button
        type="button"
        aria-label={`Add a ${choice.label.toLowerCase()} block`}
        onClick={() => onPick(choice.value)}
        className={cn(
          "absolute top-1/2 right-2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[color,background-color,opacity] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-muted hover:text-foreground",
          focusRing
        )}
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  )
}
