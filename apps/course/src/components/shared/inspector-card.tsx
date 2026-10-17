import * as React from "react"
import {
  ChevronDown,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { focusRingInset } from "@/lib/layout/focus-ring"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * A command from a panel's header to shut or open every card in it at once.
 *
 * `at` counts the presses rather than naming a state, because the cards do not
 * agree with each other: one may be shut and the next open, so "open" alone
 * would be a value a card could already match and then ignore. A fresh number
 * every press is something every card can tell it has not acted on yet.
 *
 * It is optional. A panel that never puts the button in its header provides no
 * signal, and its cards each keep their own remembered state, which is how all
 * of them worked before this existed.
 */
type CollapseAllSignal = { at: number; open: boolean }

const CollapseAllContext = React.createContext<CollapseAllSignal | null>(null)

/**
 * The header's half: the signal to hand down, and what the next press will do.
 *
 * `nextOpen` starts at false, so the first press shuts the panel. Opening a
 * panel that is already open is the press that does nothing, and a button whose
 * first use does nothing reads as broken.
 */
export function useInspectorCollapseAll() {
  const [signal, setSignal] = React.useState<CollapseAllSignal | null>(null)
  const nextOpen = signal ? !signal.open : false

  const setAll = React.useCallback(
    (open: boolean) =>
      setSignal((current) => ({ at: (current?.at ?? 0) + 1, open })),
    []
  )

  return { signal, nextOpen, setAll }
}

/**
 * The button itself, for a panel header's `action` slot.
 *
 * Here rather than written out in each panel, so the two panels of the page
 * editor — a block's settings and the page's own — cannot drift into saying
 * different things or wearing different icons for the same press.
 */
export function InspectorCollapseAllButton({
  nextOpen,
  onPress,
}: {
  /** What the next press does, from `useInspectorCollapseAll`. */
  nextOpen: boolean
  onPress: () => void
}) {
  const label = nextOpen ? "Open every setting" : "Shut every setting"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={label}
          onClick={onPress}
        >
          {nextOpen ? (
            <ChevronsUpDownIcon className="size-4" />
          ) : (
            <ChevronsDownUpIcon className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Wraps the cards a header's collapse-all button speaks to. */
export function InspectorCollapseAllProvider({
  signal,
  children,
}: {
  signal: CollapseAllSignal | null
  children: React.ReactNode
}) {
  return (
    <CollapseAllContext.Provider value={signal}>
      {children}
    </CollapseAllContext.Provider>
  )
}

/**
 * One card in a workspace screen's right-hand options panel.
 *
 * It is a grey box with a border, a heading and an arrow, rather than the white
 * `CollapsibleSettingsCard` the Settings screens use. The difference is the
 * background it sits on: a settings page is a column of white cards on a grey
 * canvas, while an options panel is a white panel beside a canvas, and a white
 * card on a white panel reads as one long list rather than as a set of groups.
 *
 * It started in the newsletter editor and moved here on 5 October 2026, when
 * the front page editor's panel became the second to use it. Tyler asked for
 * the two to match; before that the page editor's panel was white cards and the
 * newsletter's was these, side by side in the same app.
 *
 * The arrow is always drawn, never revealed on hover. A card that looks like a
 * heading until the pointer crosses it is a card nobody knows they can shut.
 */
export function InspectorCard({
  storageId,
  title,
  description,
  children,
}: {
  /**
   * Names this card in the remembered open/shut state. Plain characters only:
   * the script that keeps a shut card shut before the first paint skips any
   * key it does not recognise on sight.
   */
  storageId: string
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(storageId)
  )

  // The header's shut-everything button. Acting on it writes this card's own
  // remembered state, so a panel shut from the header is still shut after a
  // reload, exactly as if each card had been clicked.
  //
  // The ref starts at whatever press the panel is already on, so a card that
  // appears later — the inspector swaps its middle cards when the block's kind
  // changes — opens on its own remembered state rather than on a press that
  // happened before it existed.
  const collapseAll = React.useContext(CollapseAllContext)
  const actedOn = React.useRef(collapseAll?.at ?? 0)
  React.useEffect(() => {
    if (!collapseAll || collapseAll.at === actedOn.current) return
    actedOn.current = collapseAll.at
    setOpen(collapseAll.open)
  }, [collapseAll, setOpen])

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "group/card rounded-lg border bg-muted/40 p-4",
        // Fields sit on the page background rather than the transparent the
        // shared Input defaults to. On a grey card, transparent means the card
        // shows through and a box you type into looks like a box you cannot.
        // Set here, once, so a field added to one of these panels later cannot
        // forget.
        "[&_[data-slot=input]]:bg-background [&_[data-slot=select-trigger]]:bg-background [&_[data-slot=textarea]]:bg-background"
      )}
    >
      <h2 className="text-[15px] font-semibold">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left select-none",
              focusRingInset
            )}
          >
            <span>{title}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/card:-rotate-90" />
          </button>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent data-collapse-key={noFlashKey}>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        <div className="mt-4 grid gap-5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
