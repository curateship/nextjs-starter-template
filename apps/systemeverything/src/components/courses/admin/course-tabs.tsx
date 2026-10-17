import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  loadCourseQuestions,
  loadStats,
  removeQuestion,
  saveAnswer,
} from "@/lib/api/courses/admin"
import { getCourseErrorMessage } from "@/lib/courses/course-errors"
import type { AdminQuestion, CourseStats } from "@/lib/courses/course-types"
import { formatTimeAgo } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Reads its tab's data once when the tab is first opened. A tab that has not
 * been opened costs nothing, and a failed read says so with a way to retry.
 */
function useTabData<T>(load: () => Promise<T>) {
  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "ready"; data: T } | { kind: "failed"; message: string }
  >({ kind: "loading" })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    load().then(
      (data) => live && setState({ kind: "ready", data }),
      (error: unknown) => live && setState({ kind: "failed", message: getCourseErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [load, attempt])

  return {
    state,
    setData: (data: T) => setState({ kind: "ready", data }),
    retry: () => {
      setState({ kind: "loading" })
      setAttempt((count) => count + 1)
    },
  }
}

function TabFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid justify-items-start gap-2 p-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

/** Every question members asked in this course, unanswered first. */
export function CourseQuestionsTab({
  courseId,
  onUnansweredChange,
}: {
  courseId: string
  onUnansweredChange: (count: number) => void
}) {
  const load = React.useCallback(() => loadCourseQuestions(courseId), [courseId])
  const { state, setData, retry } = useTabData(load)
  const [pendingDelete, setPendingDelete] = React.useState<AdminQuestion | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const take = (questions: AdminQuestion[]) => {
    setData(questions)
    onUnansweredChange(questions.filter((question) => !question.answeredAt).length)
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      {state.kind === "loading" ? <LoadingRow label="Loading the questions…" /> : null}
      {state.kind === "failed" ? <TabFailure message={state.message} onRetry={retry} /> : null}
      {state.kind === "ready" ? (
        state.data.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No questions yet. When a member asks one under a chapter, it shows here and in
            your bell.
          </p>
        ) : (
          <ul className="grid gap-3 p-4">
            {state.data.map((question) => (
              <li key={question.id}>
                <QuestionCard
                  courseId={courseId}
                  question={question}
                  onSaved={take}
                  onDelete={() => setPendingDelete(question)}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this question?"
        description="It goes for good, with your answer, for every reader of the chapter."
        confirmLabel="Delete question"
        loading={deleting}
        onConfirm={async () => {
          if (!pendingDelete) return
          setDeleting(true)
          try {
            take(await removeQuestion(courseId, pendingDelete.id))
            setPendingDelete(null)
          } catch (error) {
            showErrorToast(getCourseErrorMessage(error))
          } finally {
            setDeleting(false)
          }
        }}
      />
    </ScrollArea>
  )
}

function QuestionCard({
  courseId,
  question,
  onSaved,
  onDelete,
}: {
  courseId: string
  question: AdminQuestion
  onSaved: (questions: AdminQuestion[]) => void
  onDelete: () => void
}) {
  // An answer is published to every reader the moment it saves, so it waits
  // for the button rather than saving half a sentence as it is typed.
  const [answer, setAnswer] = React.useState(question.answer)
  const [saving, setSaving] = React.useState(false)
  const id = `answer-${question.id}`

  async function save() {
    setSaving(true)
    dismissErrorToast()
    try {
      onSaved(await saveAnswer(courseId, question.id, answer))
      toast.success(answer.trim() ? "Answer saved. Readers can see it now." : "Answer taken back.")
    } catch (error) {
      showErrorToast(getCourseErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card size="sm">
      <CardContent className="grid gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {question.askerName} ({question.askerEmail}) on {question.chapterTitle},{" "}
            {formatTimeAgo(question.createdAt)}
            {question.answeredAt ? "" : " · Not answered yet"}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Delete this question"
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
        <p className="text-sm whitespace-pre-wrap">{question.body}</p>
        <div className="grid gap-2">
          <FieldLabel htmlFor={id}>Your answer</FieldLabel>
          <Textarea
            id={id}
            value={answer}
            maxLength={5_000}
            placeholder="Every reader of the chapter sees this under the question."
            onChange={(event) => setAnswer(event.target.value)}
          />
          <div>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {question.answeredAt ? "Save changes" : "Save answer"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** How far members get: one row per chapter. Admins are never counted. */
export function CourseStatsTab({ courseId }: { courseId: string }) {
  const load = React.useCallback(() => loadStats(courseId), [courseId])
  const { state, retry } = useTabData<CourseStats>(load)

  return (
    <ScrollArea className="min-h-0 flex-1">
      {state.kind === "loading" ? <LoadingRow label="Counting the readers…" /> : null}
      {state.kind === "failed" ? <TabFailure message={state.message} onRetry={retry} /> : null}
      {state.kind === "ready" ? (
        <div className="grid gap-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Figure label="Members who opened it" value={state.data.readers} />
            <Figure label="Finished every chapter" value={state.data.finishedCourse} />
          </div>
          {state.data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No published chapters yet, so there is nothing to count.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table containerClassName="overflow-visible">
                <TableHeader>
                  <TableRow>
                    <TableHead>Chapter</TableHead>
                    <TableHead className="text-right">Opened</TableHead>
                    <TableHead className="text-right">Marked done</TableHead>
                    <TableHead className="text-right">Stopped here</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.data.rows.map((row) => (
                    <TableRow key={row.chapterId}>
                      <TableCell>
                        <span className="block text-sm font-medium">{row.title}</span>
                        {row.groupTitle ? (
                          <span className="block text-xs text-muted-foreground">{row.groupTitle}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.opened}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.finished}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.stoppedHere}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            "Stopped here" counts members whose last opened chapter is this one and who have
            not marked every chapter done. A high number shows where readers are lost.
          </p>
        </div>
      ) : null}
    </ScrollArea>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1 rounded-lg border bg-muted/40 p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}
