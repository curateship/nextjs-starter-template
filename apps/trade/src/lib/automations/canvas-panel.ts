import type { ComponentType } from "react"

/** What the app's canvas panel is handed. */
export type AutomationCanvasPanelProps = {
  /** The flow open in the editor. */
  automationId: string
  /**
   * The run started from this canvas since the page was opened, or null.
   *
   * Deliberately only the run somebody just pressed Run for. This panel is
   * about what is happening now; the history lives in the runs panel below and
   * on whatever page the app keeps its own records.
   */
  runId: string | null
  /** Close it. The editor then offers a small button to bring it back. */
  onClose: () => void
}

/**
 * One panel the app may draw on the canvas, under the Run button.
 *
 * **Why a hole rather than a contract.** An app's steps produce things the
 * shell has no words for — a backtest report, a rendered video, a batch of
 * contacts — and the shell's own run history can only ever show a sentence and
 * a status about them. Answering that by growing the run row a piece at a time
 * means the shared panel drifts into being one app's screen. One slot the app
 * fills entirely keeps the run history identical everywhere and lets each app
 * design what its own runs actually need.
 *
 * It sits under Run because that is where somebody is looking when a flow
 * starts, rather than at the bottom of the page.
 *
 * `panel` is **a pointer to another file, never the component itself**:
 * `panel: () => import("./backtest-canvas-panel")`. The reason is the one
 * written on `fields` in `node-descriptor.ts` — a panel that loads something to
 * show imports `@/lib/api/*`, which builds a server function the moment it
 * loads, and this type is reachable from the server. A function returning an
 * import is not followed until a browser draws the panel.
 */
export type AutomationCanvasPanel = {
  /** What the button that reopens it says. */
  label: string
  /**
   * Whether this flow wants the panel at all, from the kinds of step on its
   * canvas. Unset means every flow gets it.
   *
   * The shell cannot know: one app has flows that produce something worth a
   * panel and flows that do not, and Trade is exactly that — a backtest flow
   * has a report, an ordinary flow has nothing to show and should not carry a
   * button offering one.
   */
  appliesTo?: (nodeKinds: readonly string[]) => boolean
  panel: () => Promise<{
    default: ComponentType<AutomationCanvasPanelProps>
  }>
}

/** Identity helper so a panel literal stays fully typed at the definition. */
export function defineCanvasPanel(
  panel: AutomationCanvasPanel
): AutomationCanvasPanel {
  return panel
}

/** What the app's status chip in the canvas header is handed. */
export type AutomationCanvasStatusProps = {
  /** The flow open in the editor. */
  automationId: string
}

/**
 * A small piece of the app's own, in the canvas header beside Pause all.
 *
 * **Why the header and not the panel.** The panel under Run is about what a
 * run produced — a report, a render. This is about what the flow IS right now,
 * and the header is where a person looks for that: it is the one strip on the
 * screen that is always visible and never scrolls away. Trade needs it because
 * a flow can be switched on and trading real money while the canvas beside it
 * is being edited into something else entirely, and that fact must never be a
 * card somebody has closed.
 *
 * It draws itself completely, including anything it wants to open. The shell
 * gives it a place to stand and nothing else — no chrome, no label, no state —
 * because an app's own status is not a shape the shell can guess.
 *
 * `status` is **a pointer to another file, never the component itself**, for
 * the reason written on `panel` above.
 */
export type AutomationCanvasStatus = {
  /**
   * Whether this flow wants it, from the kinds of step on its canvas. Unset
   * means every flow gets it.
   */
  appliesTo?: (nodeKinds: readonly string[]) => boolean
  status: () => Promise<{
    default: ComponentType<AutomationCanvasStatusProps>
  }>
}

/** Identity helper so a status literal stays fully typed at the definition. */
export function defineCanvasStatus(
  status: AutomationCanvasStatus
): AutomationCanvasStatus {
  return status
}

/** What an app's replacement for the Run button is handed. */
export type AutomationRunControlProps = {
  /** The flow open in the editor. */
  automationId: string
  /**
   * Whether the shell would let it run at all: nothing paused, every step
   * readable, and not already going. The app decides what to draw, but it
   * cannot make a flow runnable that the shell has already refused.
   */
  canRun: boolean
  /** Why not, in the shell's words, or null when it can. */
  reason: string | null
  /** True while a run this editor started is still going. */
  running: boolean
}

/**
 * The app's own control in place of the shell's Run button.
 *
 * **Why an app would replace it.** "Run" is the right word when a flow does one
 * thing. Trade's flows do two: a flow with pretend money on it is a backtest,
 * and a flow that names a wallet is switched on to trade — and once it is
 * switched on there is nothing to press at all. One button called Run for all
 * three states is the confusing part, and no wording the shell could choose
 * would fix it, because the shell cannot know which of the three a flow is.
 *
 * The shell keeps the judgement it is entitled to — paused, unreadable steps,
 * a run already going — and hands it over as `canRun` and `reason`. The app
 * draws the rest, and starts a run through `runAutomationNow` like any other
 * caller. Rendering nothing is allowed and means no button.
 *
 * `control` is **a pointer to another file, never the component itself**, for
 * the reason written on `panel` above.
 */
export type AutomationRunControl = {
  /**
   * Which flows the app takes the button for, from the kinds of step on the
   * canvas. Unset means all of them; the shell's own Run is used on the rest.
   */
  appliesTo?: (nodeKinds: readonly string[]) => boolean
  control: () => Promise<{
    default: ComponentType<AutomationRunControlProps>
  }>
}

/** Identity helper so a control literal stays fully typed at the definition. */
export function defineRunControl(
  control: AutomationRunControl
): AutomationRunControl {
  return control
}
