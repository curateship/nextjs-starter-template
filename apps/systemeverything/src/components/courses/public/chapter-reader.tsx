import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkIcon,
  CheckIcon,
  ListIcon,
  Loader2Icon,
  LockIcon,
  PartyPopperIcon,
  Trash2Icon,
} from "lucide-react"

import { ChapterBody } from "@/components/courses/public/chapter-body"
import type { ChapterAnswers } from "@/components/courses/public/chapter-blocks"
import { CourseSidebarCard } from "@/components/courses/public/course-sidebar"
import { CoursePreviewBar } from "@/components/courses/public/course-preview-bar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  markChapterDone,
  removeOwnQuestion,
  saveBookmark,
  saveChapterNote,
  sendQuestion,
} from "@/lib/api/courses/member"
import { usePublicHeader } from "@/lib/branding"
import { chapterHeadings } from "@/lib/courses/chapter-body"
import { getCourseErrorMessage } from "@/lib/courses/course-errors"
import type {
  ChapterPage,
  ChapterQuestion,
  QuizResult,
} from "@/lib/courses/course-types"
import { formatDate, formatTimeAgo } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * One chapter: the chapter list on the left and the words in the middle. On a
 * phone the list slides in from a button above the chapter instead.
 */
export function ChapterReader({ page }: { page: ChapterPage }) {
  const { course, outline, chapter, viewer } = page
  const preview = viewer.previewingAsFree
  const headings = chapter.body ? chapterHeadings(chapter.body) : []
  const stickyTop = usePublicHeader().sticky ? "lg:top-24" : "lg:top-4"
  const [listOpen, setListOpen] = React.useState(false)

  const sidebar = (onPick?: () => void) => (
    <CourseSidebarCard
      title={course.title}
      courseSlug={course.slug}
      outline={outline}
      currentSlug={chapter.slug}
      headings={headings}
      preview={preview}
      onPick={onPick}
    />
  )

  return (
    <div className="grid w-full" style={{ gap: pageGutter }}>
      <CoursePreviewBar
        viewer={viewer}
        here={{ course: course.slug, chapter: chapter.slug }}
        courseId={course.id}
      />
      <div
        className="grid items-start lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]"
        style={{ gap: pageGutter }}
      >
        <aside className={cn("hidden lg:sticky lg:grid", stickyTop)}>
          <ScrollArea className="max-h-[calc(100svh-8rem)]">{sidebar()}</ScrollArea>
        </aside>

        <div className="grid min-w-0 gap-4">
          <div className="lg:hidden">
            <Button type="button" variant="outline" onClick={() => setListOpen(true)}>
              <ListIcon className="size-4" />
              Chapters
            </Button>
            <Sheet open={listOpen} onOpenChange={setListOpen}>
              <SheetContent side="left" className="w-[min(22rem,90vw)] p-0">
                <SheetHeader>
                  <SheetTitle>{course.title}</SheetTitle>
                </SheetHeader>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="p-3">{sidebar(() => setListOpen(false))}</div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>

          <ChapterArticle key={chapter.id} page={page} />
        </div>
      </div>
    </div>
  )
}

/** Keyed by chapter, so moving to the next one starts from its own state. */
function ChapterArticle({ page }: { page: ChapterPage }) {
  const router = useRouter()
  const { course, chapter, viewer, member } = page
  const preview = viewer.previewingAsFree
  const canSave = Boolean(member) && viewer.signedIn && !preview
  const [done, setDone] = React.useState(member?.done ?? false)
  const [saved, setSaved] = React.useState(member?.bookmarked ?? false)
  const [ticks, setTicks] = React.useState(() => new Set(member?.ticks ?? []))
  const [quiz, setQuiz] = React.useState<Record<string, QuizResult>>(member?.quiz ?? {})
  const [busy, setBusy] = React.useState<"done" | "saved" | null>(null)
  const search = preview ? { preview: "free" as const } : {}

  const answers: ChapterAnswers = {
    chapterId: chapter.id,
    canSave,
    ticks,
    quiz,
    onTicks: setTicks,
    onQuiz: setQuiz,
  }

  async function toggleDone() {
    if (!canSave) {
      showErrorToast(
        preview
          ? "Nothing is saved while you read as a free member."
          : "Sign in to keep your place in this course."
      )
      return
    }
    setBusy("done")
    dismissErrorToast()
    try {
      await markChapterDone(chapter.id, !done)
      setDone(!done)
      // The ticks in the left list and the finished screen come from the
      // server, so the page asks again rather than guessing.
      await router.invalidate()
    } catch (error) {
      showErrorToast(getCourseErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  async function toggleSaved() {
    if (!canSave) {
      showErrorToast(
        preview
          ? "Nothing is saved while you read as a free member."
          : "Sign in to save chapters."
      )
      return
    }
    setBusy("saved")
    dismissErrorToast()
    try {
      await saveBookmark(chapter.id, !saved)
      setSaved(!saved)
    } catch (error) {
      showErrorToast(getCourseErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold text-pretty md:text-4xl">{chapter.title}</h1>
        <p className="text-sm text-muted-foreground">{chapter.readMinutes} min read</p>
        {chapter.body ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={done ? "secondary" : "outline"}
              onClick={() => void toggleDone()}
              disabled={busy === "done"}
              aria-pressed={done}
            >
              {busy === "done" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <CheckIcon className="size-4" />
              )}
              {done ? "Done" : "Mark as done"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void toggleSaved()}
              disabled={busy === "saved"}
              aria-pressed={saved}
            >
              {busy === "saved" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <BookmarkIcon className={cn("size-4", saved && "fill-current")} />
              )}
              {saved ? "Saved" : "Save"}
            </Button>
            {canSave ? (
              <Button asChild variant="ghost">
                <Link to="/courses/saved">Your saved chapters</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {chapter.audioUrl ? (
          <div className="grid gap-1">
            <p className="text-xs text-muted-foreground">Listen to this chapter</p>
            <audio src={chapter.audioUrl} controls preload="none" className="w-full max-w-md" />
          </div>
        ) : null}
      </header>

      {chapter.body ? (
        <ChapterBody body={chapter.body} answers={answers} />
      ) : (
        <LockedChapter page={page} />
      )}

      {chapter.body && page.finishedCourse ? (
        <FinishedCourse page={page} />
      ) : null}

      <nav aria-label="Next and previous chapter" className="grid gap-2 sm:grid-cols-2">
        {page.previous ? (
          <Link
            to="/courses/$course/$chapter"
            params={{ course: course.slug, chapter: page.previous.slug }}
            search={search}
            className={cn(
              "grid gap-1 rounded-lg border bg-card p-4 hover:bg-muted/60",
              focusRing
            )}
          >
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowLeftIcon className="size-3.5" aria-hidden />
              Previous
            </span>
            <span className="text-sm font-medium">{page.previous.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {page.next ? (
          <Link
            to="/courses/$course/$chapter"
            params={{ course: course.slug, chapter: page.next.slug }}
            search={search}
            className={cn(
              "grid gap-1 rounded-lg border bg-card p-4 text-right hover:bg-muted/60",
              focusRing
            )}
          >
            <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              {page.next.open ? null : <LockIcon className="size-3.5" aria-hidden />}
              Next
              <ArrowRightIcon className="size-3.5" aria-hidden />
            </span>
            <span className="text-sm font-medium">{page.next.title}</span>
          </Link>
        ) : null}
      </nav>

      {chapter.body && canSave ? (
        <ChapterNotes chapterId={chapter.id} initial={member?.note ?? ""} />
      ) : null}

      {chapter.body ? (
        <ChapterQuestions
          chapterId={chapter.id}
          initial={page.questions}
          canAsk={canSave}
          signedIn={viewer.signedIn}
          preview={preview}
          here={`/courses/${course.slug}/${chapter.slug}`}
        />
      ) : null}
    </article>
  )
}

function LockedChapter({ page }: { page: ChapterPage }) {
  const { chapter } = page
  const here = `/courses/${page.course.slug}/${chapter.slug}`

  if (chapter.lockReason === "waiting") {
    return (
      <Card>
        <CardContent className="grid gap-2 py-4">
          <p className="flex items-center gap-2 text-base font-semibold">
            <LockIcon className="size-4" aria-hidden />
            This chapter opens {chapter.opensAt ? formatDate(chapter.opensAt) : "soon"}
          </p>
          <p className="text-sm text-muted-foreground">
            Chapters in this course open a few days apart, counted from when you
            started it. Come back then, or keep going with the chapters already open.
          </p>
        </CardContent>
      </Card>
    )
  }

  const signIn = chapter.lockReason === "sign-in"
  return (
    <Card>
      <CardContent className="grid gap-3 py-4">
        <p className="flex items-center gap-2 text-base font-semibold">
          <LockIcon className="size-4" aria-hidden />
          {signIn ? "Sign in to keep reading" : "Join to keep reading"}
        </p>
        <p className="text-sm text-muted-foreground">
          {signIn
            ? "This chapter is for members of the site. Sign in, or make a free account, to read it."
            : "This chapter is part of a paid plan. Pick a plan to read every chapter in this course."}
        </p>
        <div className="flex flex-wrap gap-2">
          {signIn ? (
            <>
              <Button asChild>
                <Link to="/login" search={{ redirect: here }}>
                  Sign in
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/register" search={{}}>
                  Make an account
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild>
              <Link to="/pricing">See the plans</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FinishedCourse({ page }: { page: ChapterPage }) {
  return (
    <Card>
      <CardContent className="grid gap-3 py-4">
        <p className="flex items-center gap-2 text-lg font-semibold">
          <PartyPopperIcon className="size-5 text-primary" aria-hidden />
          You finished {page.course.title}
        </p>
        <p className="text-sm text-muted-foreground">
          Every chapter is marked done. Your notes and saved chapters stay where they are.
        </p>
        <div className="flex flex-wrap gap-2">
          {page.nextCourse ? (
            <Button asChild>
              <Link to="/courses/$course" params={{ course: page.nextCourse.slug }}>
                Next: {page.nextCourse.title}
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link to="/courses">All courses</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** The member's own notes. They save on their own, 700ms after typing stops. */
function ChapterNotes({ chapterId, initial }: { chapterId: string; initial: string }) {
  const [text, setText] = React.useState(initial)
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved">("idle")
  const sent = React.useRef(initial)

  React.useEffect(() => {
    if (text === sent.current) return
    const timer = setTimeout(async () => {
      setStatus("saving")
      try {
        await saveChapterNote(chapterId, text)
        sent.current = text
        setStatus("saved")
      } catch (error) {
        setStatus("idle")
        showErrorToast(getCourseErrorMessage(error))
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [chapterId, text])

  return (
    <Card>
      <CardContent className="grid gap-2 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <FieldLabel htmlFor={`notes-${chapterId}`}>Your notes</FieldLabel>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Only you can see these"}
          </span>
        </div>
        <Textarea
          id={`notes-${chapterId}`}
          value={text}
          maxLength={10_000}
          placeholder="Write anything you want to remember from this chapter."
          onChange={(event) => setText(event.target.value)}
        />
      </CardContent>
    </Card>
  )
}

function ChapterQuestions({
  chapterId,
  initial,
  canAsk,
  signedIn,
  preview,
  here,
}: {
  chapterId: string
  initial: ChapterQuestion[]
  canAsk: boolean
  signedIn: boolean
  preview: boolean
  here: string
}) {
  const [questions, setQuestions] = React.useState(initial)
  const [text, setText] = React.useState("")
  const [sending, setSending] = React.useState(false)

  async function ask(event: React.FormEvent) {
    event.preventDefault()
    if (!text.trim()) {
      showErrorToast("Write your question first.")
      return
    }
    setSending(true)
    dismissErrorToast()
    try {
      setQuestions(await sendQuestion(chapterId, text))
      setText("")
    } catch (error) {
      // What was typed stays in the box, so nothing is lost to a failed send.
      showErrorToast(getCourseErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  async function remove(id: string) {
    try {
      setQuestions(await removeOwnQuestion(id))
    } catch (error) {
      showErrorToast(getCourseErrorMessage(error))
    }
  }

  return (
    <section aria-labelledby={`questions-${chapterId}`} className="grid gap-3">
      <h2 id={`questions-${chapterId}`} className="text-lg font-semibold">
        Questions
      </h2>
      {canAsk ? (
        <form onSubmit={(event) => void ask(event)} className="grid gap-2">
          <FieldLabel htmlFor={`ask-${chapterId}`}>Ask a question about this chapter</FieldLabel>
          <Textarea
            id={`ask-${chapterId}`}
            value={text}
            maxLength={2_000}
            placeholder="Everyone reading this course will see your question and the answer."
            onChange={(event) => setText(event.target.value)}
          />
          <div>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Ask
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          {preview ? (
            "Asking is off while you read as a free member."
          ) : signedIn ? (
            "Questions are for members who can read this course."
          ) : (
            <>
              <Link
                to="/login"
                search={{ redirect: here }}
                className={cn("underline underline-offset-2", focusRing)}
              >
                Sign in
              </Link>{" "}
              to ask a question.
            </>
          )}
        </p>
      )}
      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : (
        <ul className="grid gap-3">
          {questions.map((question) => (
            <li key={question.id}>
              <Card size="sm">
                <CardContent className="grid gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {question.askerName} asked {formatTimeAgo(question.createdAt)}
                    </p>
                    {question.mine ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete your question"
                        onClick={() => void remove(question.id)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{question.body}</p>
                  {question.answer ? (
                    <div className="grid gap-1 rounded-md border-l-2 border-primary bg-muted/60 px-3 py-2">
                      <p className="text-xs font-medium">Answer</p>
                      <p className="text-sm whitespace-pre-wrap">{question.answer}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Waiting for an answer.</p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
