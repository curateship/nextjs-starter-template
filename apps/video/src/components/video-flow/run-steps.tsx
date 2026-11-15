import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeftIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClapperboardIcon, SquareIcon } from "lucide-react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { DashboardCardHeader, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getFlowErrorMessage, getFlowRun, stopFlowRun, type FlowRunDetail } from "@/lib/api/video/flow"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import { cn } from "@/lib/utils"
import type { FlowRunStep } from "@/lib/video/flow/flows"
import type { FlowSearch } from "@/lib/video/flow/flow-search"
import { FLOW_RUN_STATUS_LABELS, flowRunIsLive, type FlowStepInput } from "@/lib/video/flow/run-shape"

import { RunStepPanel } from "./run-step-panel"
import { SavePreview, SaveStepPanel } from "./run-save-step"
import { StepPreview } from "./run-step-preview"

/** The guide's last step, saving into a project, in the address as `?step=save`. */
const SAVE_STEP = "save"
const SAVE_TITLE = "Save to a project"
const SAVE_LINE = "Pick the project the video goes into"

/** How often the page asks how the run is getting on while a step is being made. */
const POLL_MS = 3_000

/** The step the guide opens on: the first one not done, else the last. */
function firstOpenStep(steps: readonly FlowRunStep[]) {
  return steps.find((step) => step.status !== "done") ?? steps.at(-1) ?? null
}

/**
 * A run as a stepped guide, in the middle when a run is opened (Tyler,
 * 14 Nov 2026: "the way it was now is NOT stepped guide. This is how it
 * should look", with his picture,
 * `workspace/docs/assets/pasted-image-1794672552219558000.png`).
 *
 * - **Header:** the flow's name and the run's state, then "N of M done" and
 *   a bar of one piece a step, then the ⋮ with Open the video and Stop.
 * - **Left of the middle:** every step down the side, numbered and joined
 *   by a line, each with its title and what it asks you for under it. A step
 *   is a node; the boxes it asks for are inside it. A press opens it.
 * - **Right of the middle:** the step showing: "Step 1/6", its heading and
 *   short line, a card previewing what it holds (what is typed on the right
 *   shows here as it is typed), its explanation, then Previous and Next.
 * - **The right panel** (`run-step-panel.tsx`) is the step's own box, its tip
 *   and its button.
 *
 * While a step is being made the page asks every 3 seconds, and stops asking
 * once the run waits on the person or has finished.
 */
export function RunStepsPage({
  initial,
  search,
  headingEnd,
  frame,
}: {
  initial: FlowRunDetail
  search: FlowSearch
  headingEnd: React.ReactNode
  frame: CrmFrame
}) {
  const setListSearch = useListSearchNavigate()
  const [run, setRun] = React.useState(initial)
  const [stopOpen, setStopOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [stop, stopping] = useAsyncAction(getFlowErrorMessage)
  // What is typed on the right, per step, so the middle can show it as it is typed.
  // By step, then by box; what is typed is kept while the guide moves between steps.
  const [drafts, setDrafts] = React.useState<Record<string, Record<string, FlowStepInput>>>({})

  const making = run.steps.some((step) => step.status === "queued" || step.status === "working") && run.status === "running"
  React.useEffect(() => {
    if (!making) return
    const timer = window.setInterval(() => {
      getFlowRun(run.id)
        .then(setRun)
        .catch(() => undefined)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [making, run.id])

  // One step a node that makes something; the boxes that feed it are on its
  // right panel (Tyler, 14 Nov 2026: "paste a transcript is not a step.
  // Generate a script is.").
  // A step a node; the boxes it asks for are inside it (Tyler, 14 Nov 2026:
  // "paste a transcript is not a step. Generate a script is.").
  const steps = run.steps
  // The last step is saving into a project (Tyler, 14 Nov 2026: "its the last
  // step"). It opens by itself once every other step is done and it isn't.
  const saved = run.projectId !== null
  const allMade = steps.every((step) => step.status === "done")
  const saving = search.step === SAVE_STEP || (!search.step && allMade && !saved)
  const picked = saving ? null : (steps.find((step) => step.id === search.step) ?? firstOpenStep(steps))
  const index = saving ? steps.length : picked ? steps.indexOf(picked) : -1
  const total = steps.length + 1
  const done = steps.filter((step) => step.status === "done").length + (saved ? 1 : 0)
  const live = flowRunIsLive(run.status)
  const goTo = (step: FlowRunStep | typeof SAVE_STEP | undefined) => {
    if (step === SAVE_STEP) setListSearch({ step: SAVE_STEP })
    else if (step) setListSearch({ step: step.id })
  }
  const draftFor = (step: FlowRunStep, boxId: string): FlowStepInput => drafts[step.id]?.[boxId] ?? step.input?.[boxId] ?? {}

  const header = (
    <DashboardCardHeader className="@container gap-3">
      <PanelReopenButton side="left" label="Show the page" />
      {/* Back to the flow's canvas (Tyler, 14 Nov 2026: "Add arrow to go back
          to canvas"). A run whose flow was deleted has none. */}
      {run.flowId ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon" className="-ml-1 shrink-0">
              <Link to="/admin/video-flow" search={{ edit: run.flowId }} aria-label="Back to the canvas">
                <ArrowLeftIcon className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to the canvas</TooltipContent>
        </Tooltip>
      ) : null}
      <span className="flex min-w-0 shrink items-baseline gap-2.5">
        <h2 className={cn("min-w-0 shrink truncate", dashboardCardHeadingClassName)}>{run.flowName}</h2>
        <span className="shrink-0 text-sm text-muted-foreground">{FLOW_RUN_STATUS_LABELS[run.status]}</span>
      </span>
      <div className="ml-auto flex shrink-0 items-center gap-3">
        <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums @max-xl:sr-only">
          {done} of {total} done
        </span>
        <span className="hidden items-center gap-1 @2xl:flex" aria-hidden>
          {[...steps.map((step) => step.status === "done"), saved].map((isDone, at) => (
            <span
              key={at}
              className={cn("h-1 w-6 rounded-full", isDone ? "bg-foreground" : at === index ? "bg-muted-foreground/60" : "bg-muted")}
            />
          ))}
        </span>
        <FoldingMenu label="More for this run" fit align="end" open={menuOpen} onOpenChange={setMenuOpen}>
          {run.videoId && run.projectId ? (
            <Button asChild variant="ghost" className="w-full justify-start gap-2 px-2 font-normal [&_svg]:size-4">
              <Link to="/admin/video-editor/$projectId" params={{ projectId: run.projectId }} search={{ video: run.videoId }}>
                <ClapperboardIcon />
                Open the video
              </Link>
            </Button>
          ) : null}
          {live ? (
            <MenuAction
              icon={<SquareIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                setStopOpen(true)
              }}
            >
              Stop the run
            </MenuAction>
          ) : null}
          {!run.videoId && !live ? <p className="px-2 py-1.5 text-sm text-muted-foreground">Nothing to do here.</p> : null}
        </FoldingMenu>
      </div>
      {headingEnd}
    </DashboardCardHeader>
  )

  const stepper = (
    // On a light grey of its own beside the step (Tyler, 14 Nov 2026: "Add
    // light gray bg").
    <ScrollArea className="hidden min-h-0 border-r bg-muted/40 @3xl:block">
      <ol className="grid gap-2 px-3 py-5" aria-label="Steps">
        {steps.map((step, at) => {
          const showing = step === picked
          const sub = step.boxes.length ? `Asks for ${step.boxes.map((box) => box.label).join(", ")}` : step.prompt
          return (
            <li key={step.id} className="relative">
              {/* The line joining the numbers is a drawing, not a divider, so it
                  keeps its own darker grey whatever Settings → Styling sets for
                  divider lines (Tyler, 14 Nov 2026: "unwire the border to the
                  styling settings and make the border darker"). */}
              <span aria-hidden className="absolute top-12 -bottom-5 left-[29.5px] w-px bg-foreground/20" />
              <button
                type="button"
                aria-current={showing ? "step" : undefined}
                onClick={() => goTo(step)}
                className={cn(
                  // A grey of its own while pointed at (Tyler, 14 Nov 2026: "add gray hover effect").
                  "relative grid w-full grid-cols-[2.25rem_minmax(0,1fr)] gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted",
                  focusRingInset
                )}
              >
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-full border bg-card text-sm tabular-nums",
                    showing && "border-2 border-foreground font-medium",
                    step.status === "done" && "border-foreground bg-foreground text-background",
                    step.status === "failed" && "border-destructive text-destructive"
                  )}
                >
                  {step.status === "done" ? <CheckIcon className="size-4" /> : at + 1}
                </span>
                <span className="grid min-w-0 gap-0.5 pt-1.5">
                  <span className={cn("text-base leading-snug", showing ? "font-medium text-foreground" : "text-foreground/90")}>
                    {step.title}
                  </span>
                  {sub ? <span className="line-clamp-3 text-sm text-muted-foreground">{sub}</span> : null}
                </span>
              </button>
            </li>
          )
        })}
        <li className="relative">
          <button
            type="button"
            aria-current={saving ? "step" : undefined}
            onClick={() => goTo(SAVE_STEP)}
            className={cn(
                  // A grey of its own while pointed at (Tyler, 14 Nov 2026: "add gray hover effect").
                  "relative grid w-full grid-cols-[2.25rem_minmax(0,1fr)] gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted",
                  focusRingInset
                )}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full border bg-card text-sm tabular-nums",
                saving && "border-2 border-foreground font-medium",
                saved && "border-foreground bg-foreground text-background"
              )}
            >
              {saved ? <CheckIcon className="size-4" /> : total}
            </span>
            <span className="grid min-w-0 gap-0.5 pt-1.5">
              <span className={cn("text-base leading-snug", saving ? "font-medium text-foreground" : "text-foreground/90")}>
                {SAVE_TITLE}
              </span>
              <span className="line-clamp-3 text-sm text-muted-foreground">{saved ? `Saved in ${run.projectName}` : SAVE_LINE}</span>
            </span>
          </button>
        </li>
      </ol>
    </ScrollArea>
  )

  const pager = (
    <div className="flex justify-center gap-3">
      <Button type="button" variant="outline" size="lg" disabled={index <= 0} onClick={() => goTo(index - 1 >= 0 ? steps[index - 1] : undefined)}>
        <ChevronLeftIcon />
        Previous
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={saving}
        onClick={() => goTo(index + 1 < steps.length ? steps[index + 1] : SAVE_STEP)}
      >
        Next
        <ChevronRightIcon />
      </Button>
    </div>
  )

  const content = saving ? (
    <ScrollArea className="min-h-0">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-8 @4xl:px-12">
        <div className="grid gap-1">
          <span className="text-sm text-muted-foreground tabular-nums">
            Step {total}/{total}
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">{SAVE_TITLE}</h2>
          <p className="text-lg text-muted-foreground">{SAVE_LINE}</p>
        </div>
        <SavePreview run={run} />
        <p className="text-base leading-relaxed">
          The run's video goes into the project you pick, with its cut and captions, and its thumbnail on the video's
          Thumbnail board. Every file the run was given or made goes on the project's Media shelf. Nothing is in a
          project until you save.
        </p>
        {pager}
      </div>
    </ScrollArea>
  ) : picked ? (
    <ScrollArea className="min-h-0">
      <div className="mx-auto grid w-full max-w-3xl gap-6 px-6 py-8 @4xl:px-12">
        <div className="grid gap-1">
          <span className="text-sm text-muted-foreground tabular-nums">
            Step {index + 1}/{total}
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-balance">{picked.heading || picked.title}</h2>
          {picked.line ? <p className="text-lg text-muted-foreground">{picked.line}</p> : null}
        </div>
        <StepPreview run={run} step={picked} draftFor={draftFor} />
        {picked.explanation ? <p className="text-base leading-relaxed">{picked.explanation}</p> : null}
        {pager}
      </div>
    </ScrollArea>
  ) : null

  return frame({
    ids: [],
    showMiddleFor: `run|${run.id}`,
    showRightFor: search.step,
    middle: (
      <div className="@container flex min-h-0 flex-1 flex-col">
        {header}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] @3xl:grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
          {stepper}
          {content}
        </div>
      </div>
    ),
    right: saving
      ? {
          label: "Step",
          showLabel: "Show the step",
          content: <SaveStepPanel key={`save:${run.projectId ?? ""}`} run={run} index={index} count={total} onRun={setRun} />,
        }
      : picked
      ? {
          label: "Step",
          showLabel: "Show the step",
          content: (
            <RunStepPanel
              key={`${picked.id}:${picked.status}`}
              run={run}
              step={picked}
              index={index}
              count={total}
              draftFor={draftFor}
              onDraft={(step, boxId, input) =>
                setDrafts((current) => ({ ...current, [step.id]: { ...current[step.id], [boxId]: input } }))
              }
              onRun={(next, moveOn) => {
                setRun(next)
                if (moveOn) goTo(next.steps[index + 1] ?? SAVE_STEP)
              }}
            />
          ),
        }
      : null,
    windows: (
      <ConfirmDialog
        open={stopOpen}
        onOpenChange={setStopOpen}
        title="Stop this run?"
        description="Nothing more happens in it. A step being made finishes, but nothing after it starts. What it made so far stays in the project."
        confirmLabel="Stop the run"
        loading={stopping}
        onConfirm={() =>
          void stop(async () => {
            await stopFlowRun(run.id)
            setRun(await getFlowRun(run.id))
            setStopOpen(false)
          })
        }
      />
    ),
  })
}
