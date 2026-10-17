import * as React from "react"
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  LightbulbIcon,
  Loader2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { WrittenPageBody } from "@/components/pages/written-page-body"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  checkQuizAnswers,
  tickItem,
} from "@/lib/api/courses/member"
import { getCourseErrorMessage } from "@/lib/courses/course-errors"
import type {
  CalloutNode,
  ChecklistNode,
  FoldoutNode,
  ImageNode,
  PromptNode,
  QuizNode,
  TableNode,
  VideoNode,
} from "@/lib/courses/chapter-body"
import type { QuizResult } from "@/lib/courses/course-types"
import { focusRing } from "@/lib/layout/focus-ring"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The blocks a chapter adds to a written page, drawn for a reader. Like the
 * shell's own renderer, nothing here builds a string of markup: every value
 * an admin typed reaches the page as text React escapes.
 */

export function ImageBlock({ node }: { node: ImageNode }) {
  return (
    <figure className="grid gap-2">
      <img
        src={node.attrs.src}
        srcSet={mediaImageSrcSet(node.attrs.src)}
        sizes="(min-width: 1184px) 760px, 100vw"
        alt={node.attrs.alt}
        loading="lazy"
        // Capped, so a tall screenshot never fills the whole column.
        className="mx-auto h-auto max-h-[36rem] w-auto max-w-full rounded-lg border object-contain"
      />
    </figure>
  )
}

export function VideoBlock({ node }: { node: VideoNode }) {
  if (node.attrs.source === "youtube") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg border bg-muted">
        <iframe
          // The no-cookie address, so a visitor is not tracked by YouTube
          // until they press play.
          src={`https://www.youtube-nocookie.com/embed/${node.attrs.src}`}
          title="Video"
          className="size-full"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }
  return (
    <video
      src={node.attrs.src}
      controls
      preload="metadata"
      className="w-full rounded-lg border bg-muted"
    />
  )
}

const CALLOUT = {
  tip: {
    label: "Tip",
    icon: LightbulbIcon,
    box: "border-primary/30 bg-primary/5",
    mark: "text-primary",
  },
  warning: {
    label: "Watch out",
    icon: TriangleAlertIcon,
    box: "border-destructive/30 bg-destructive/5",
    mark: "text-destructive",
  },
} as const

export function CalloutBlock({ node }: { node: CalloutNode }) {
  const tone = CALLOUT[node.attrs.tone]
  const Icon = tone.icon
  return (
    <aside
      className={cn("grid gap-2 rounded-lg border p-4", tone.box)}
      aria-label={tone.label}
    >
      {/* The word as well as the colour, so the box says what it is to
          somebody who cannot tell the two colours apart. */}
      <p className={cn("flex items-center gap-2 text-sm font-semibold", tone.mark)}>
        <Icon className="size-4" aria-hidden />
        {tone.label}
      </p>
      <WrittenPageBody body={{ type: "doc", content: node.content }} />
    </aside>
  )
}

export function PromptBlock({ node }: { node: PromptNode }) {
  const text = node.content?.[0]?.text ?? ""
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  if (!text) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      showErrorToast("This browser would not copy. Select the text and copy it instead.")
    }
  }

  return (
    <div className="relative rounded-lg border bg-muted/60">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 bg-background"
        onClick={() => void copy()}
      >
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <ScrollArea className="w-full">
        <pre className="p-4 pr-24 font-mono text-sm leading-relaxed whitespace-pre-wrap">
          {text}
        </pre>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}

export function FoldoutBlock({ node }: { node: FoldoutNode }) {
  return (
    // The browser's own open-and-shut box: it works with a keyboard and a
    // screen reader, and it opens on its own when a search lands inside it.
    <details className="group rounded-lg border bg-card">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden",
          focusRing
        )}
      >
        <ChevronRightIcon
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
        {node.attrs.summary || "Show more"}
      </summary>
      <div className="border-t px-4 py-3">
        <WrittenPageBody body={{ type: "doc", content: node.content }} />
      </div>
    </details>
  )
}

export function TableBlock({ node }: { node: TableNode }) {
  const [head, ...body] = node.attrs.header ? node.attrs.rows : [null, ...node.attrs.rows]
  return (
    // Wide tables slide sideways inside their own box on a phone, rather
    // than pushing the page wider than the window.
    <ScrollArea className="w-full rounded-lg border">
      <table className="w-full text-left text-sm">
        {head ? (
          <thead className="bg-muted/60">
            <tr>
              {head.map((cell, index) => (
                <th key={index} scope="col" className="border-b px-3 py-2 font-semibold">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b last:border-b-0">
              {(row ?? []).map((cell, index) => (
                <td key={index} className="px-3 py-2 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

/** What the interactive blocks need to keep a member's own answers. */
export type ChapterAnswers = {
  chapterId: string
  /** False when signed out, or when an admin is reading as a free member. */
  canSave: boolean
  ticks: Set<string>
  quiz: Record<string, QuizResult>
  onTicks: (ticks: Set<string>) => void
  onQuiz: (quiz: Record<string, QuizResult>) => void
}

export function ChecklistBlock({
  node,
  answers,
}: {
  node: ChecklistNode
  answers: ChapterAnswers
}) {
  const done = node.attrs.items.filter((item) => answers.ticks.has(item.id)).length

  async function toggle(itemId: string, ticked: boolean) {
    if (!answers.canSave) {
      showErrorToast("Sign in to keep your ticks.")
      return
    }
    // Ticked on screen at once, and put back if the save is refused.
    const before = answers.ticks
    const next = new Set(before)
    if (ticked) next.add(itemId)
    else next.delete(itemId)
    answers.onTicks(next)
    try {
      await tickItem(answers.chapterId, itemId, ticked)
    } catch (error) {
      answers.onTicks(before)
      showErrorToast(getCourseErrorMessage(error))
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        {done} of {node.attrs.items.length} done
      </p>
      <ul className="grid gap-2">
        {node.attrs.items.map((item) => {
          const id = `check-${answers.chapterId}-${item.id}`
          return (
            <li key={item.id} className="flex items-start gap-3">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={answers.ticks.has(item.id)}
                onCheckedChange={(checked) => void toggle(item.id, checked === true)}
              />
              <label
                htmlFor={id}
                className={cn(
                  "text-sm leading-relaxed",
                  answers.ticks.has(item.id) && "text-muted-foreground line-through"
                )}
              >
                {item.text}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function QuizBlock({
  node,
  answers,
}: {
  node: QuizNode
  answers: ChapterAnswers
}) {
  const questions = node.attrs.questions
  // What the reader has picked and not checked yet, over what was checked.
  const [picked, setPicked] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      questions.flatMap((question) => {
        const saved = answers.quiz[question.id]
        return saved ? [[question.id, saved.choiceId]] : []
      })
    )
  )
  const [checking, setChecking] = React.useState(false)
  const checked = questions.filter((question) => answers.quiz[question.id])
  const right = checked.filter((question) => answers.quiz[question.id]?.correct).length

  async function check() {
    if (!answers.canSave) {
      showErrorToast("Sign in to check your answers.")
      return
    }
    const mine = Object.fromEntries(
      questions.flatMap((question) =>
        picked[question.id] ? [[question.id, picked[question.id]]] : []
      )
    )
    if (Object.keys(mine).length === 0) {
      showErrorToast("Pick an answer to at least one question first.")
      return
    }
    setChecking(true)
    try {
      const results = await checkQuizAnswers(answers.chapterId, mine)
      answers.onQuiz({ ...answers.quiz, ...results })
      const score = Object.values(results).filter((result) => result.correct).length
      toast.success(`${score} of ${Object.keys(results).length} right.`)
    } catch (error) {
      showErrorToast(getCourseErrorMessage(error))
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">Quiz</p>
        {checked.length ? (
          <p className="text-sm text-muted-foreground">
            Your score: {right} of {questions.length}
          </p>
        ) : null}
      </div>
      <ol className="grid gap-4">
        {questions.map((question, index) => {
          const result = answers.quiz[question.id]
          // A result only counts for the choice it was given for. Picking a
          // different one clears the marks until it is checked again.
          const showResult = result && result.choiceId === picked[question.id]
          return (
            <li key={question.id}>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium">
                  {index + 1}. {question.prompt}
                </legend>
                {question.choices.map((choice) => {
                  const id = `quiz-${answers.chapterId}-${question.id}-${choice.id}`
                  const chosen = picked[question.id] === choice.id
                  const isRight = showResult && result.rightChoiceId === choice.id
                  const isWrong = showResult && chosen && !result.correct
                  return (
                    <label
                      key={choice.id}
                      htmlFor={id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm",
                        chosen && "border-primary",
                        isRight && "border-primary bg-primary/5",
                        isWrong && "border-destructive bg-destructive/5"
                      )}
                    >
                      <input
                        id={id}
                        type="radio"
                        name={`quiz-${answers.chapterId}-${question.id}`}
                        value={choice.id}
                        checked={chosen}
                        onChange={() =>
                          setPicked((current) => ({ ...current, [question.id]: choice.id }))
                        }
                        className="size-4 accent-primary"
                      />
                      <span className="flex-1">{choice.text}</span>
                      {/* Words beside the colour, for anyone who cannot see it. */}
                      {isRight ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-primary">
                          <CheckIcon className="size-3.5" aria-hidden />
                          Right answer
                        </span>
                      ) : null}
                      {isWrong ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                          <XIcon className="size-3.5" aria-hidden />
                          Not this one
                        </span>
                      ) : null}
                    </label>
                  )
                })}
              </fieldset>
            </li>
          )
        })}
      </ol>
      <div>
        <Button type="button" onClick={() => void check()} disabled={checking}>
          {checking ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Check answers
        </Button>
      </div>
    </div>
  )
}
