import * as React from "react"
import {
  AlertCircleIcon,
  Loader2Icon,
  SendIcon,
  ThumbsUpIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AdminModalContent } from "@/pages/shared/admin-modal"
import {
  createFeedback,
  getFeedbackErrorMessage,
  listFeedback,
  toggleFeedbackVote,
  type FeedbackItem,
  type FeedbackType,
} from "@/lib/feedback-api"

const feedbackTypes: Array<{ type: FeedbackType; label: string }> = [
  { type: "suggestion", label: "Suggestion" },
  { type: "bug_report", label: "Bug Report" },
  { type: "question", label: "Question" },
  { type: "praise", label: "Praise" },
]

const feedbackTypeLabels: Record<FeedbackType, string> = {
  suggestion: "Suggestion",
  bug_report: "Bug Report",
  question: "Question",
  praise: "Praise",
}

type FeedbackFilter = "all" | FeedbackType

type FeedbackModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (feedback: FeedbackItem) => void
}

export function FeedbackModal({
  open,
  onOpenChange,
  onCreated,
}: FeedbackModalProps) {
  const [feedbackType, setFeedbackType] =
    React.useState<FeedbackType>("suggestion")
  const [message, setMessage] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [feedback, setFeedback] = React.useState<FeedbackItem[]>([])
  const [feedbackFilter, setFeedbackFilter] =
    React.useState<FeedbackFilter>("all")
  const [loadingFeedback, setLoadingFeedback] = React.useState(false)
  const [votingId, setVotingId] = React.useState<string | null>(null)
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!open) return

    let active = true
    setError(null)
    setExpandedIds(new Set())
    setLoadingFeedback(true)

    listFeedback()
      .then((data) => {
        if (!active) return
        setFeedback(data.feedback)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getFeedbackErrorMessage(loadError))
      })
      .finally(() => {
        if (!active) return
        setLoadingFeedback(false)
      })

    return () => {
      active = false
    }
  }, [open])

  const filteredFeedback = React.useMemo(
    () =>
      feedbackFilter === "all"
        ? feedback
        : feedback.filter((item) => item.type === feedbackFilter),
    [feedback, feedbackFilter]
  )
  const feedbackListTitle =
    feedbackFilter === "all"
      ? "Feedback"
      : feedbackTypeLabels[feedbackFilter]

  const handleSubmit = async () => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) {
      setError("Feedback message is required.")
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      const created = await createFeedback({
        type: feedbackType,
        message: trimmedMessage,
      })
      setFeedback((current) => [created, ...current])
      setMessage("")
      setFeedbackType("suggestion")
      onCreated?.(created)
    } catch (submitError) {
      setError(getFeedbackErrorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVote = async (item: FeedbackItem) => {
    setVotingId(item.id)
    setError(null)
    try {
      const updated = await toggleFeedbackVote(item.id)
      setFeedback((current) =>
        current.map((currentItem) =>
          currentItem.id === updated.id ? updated : currentItem
        )
      )
    } catch (voteError) {
      setError(getFeedbackErrorMessage(voteError))
    } finally {
      setVotingId(null)
    }
  }

  const toggleExpanded = (feedbackId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(feedbackId)) {
        next.delete(feedbackId)
      } else {
        next.add(feedbackId)
      }
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AdminModalContent
        title="Send Feedback"
        description="Share a request, report, question, or win."
      >
        <div className="rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
          <Textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What's on your mind?"
            className="min-h-32 resize-none border-0 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0"
            disabled={isSubmitting}
            autoFocus
          />

          <div className="flex flex-col gap-2 p-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {feedbackTypes.map((item) => (
                <Button
                  key={item.type}
                  type="button"
                  variant={feedbackType === item.type ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setFeedbackType(item.type)}
                  disabled={isSubmitting}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="self-start sm:self-auto"
            >
              {isSubmitting ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
              {isSubmitting ? "Sending" : "Send"}
            </Button>
          </div>
        </div>

        <Card className="rounded-md bg-muted/50">
          <CardHeader>
            <CardTitle>
              {feedbackListTitle}{" "}
              <Badge variant="secondary">{filteredFeedback.length}</Badge>
            </CardTitle>
            <CardAction>
              <Select
                value={feedbackFilter}
                onValueChange={(value) =>
                  setFeedbackFilter(value as FeedbackFilter)
                }
              >
                <SelectTrigger
                  className="h-8 text-xs"
                  aria-label="Filter feedback"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(feedbackTypeLabels).map(([type, label]) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardAction>
          </CardHeader>

          <CardContent>
            {loadingFeedback ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Loading feedback
              </div>
            ) : filteredFeedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback found.</p>
            ) : (
              <CardGroup>
                {filteredFeedback.map((item) => {
                  const words = item.message.trim().split(/\s+/)
                  const isLong = words.length > 40
                  const isExpanded = expandedIds.has(item.id)
                  const message =
                    isLong && !isExpanded
                      ? words.slice(0, 40).join(" ")
                      : item.message

                  return (
                    <Card key={item.id} className="rounded-md">
                      <CardHeader>
                        <CardTitle className="text-sm font-normal">
                          {message}
                          {isLong && !isExpanded ? " " : null}
                          {isLong && !isExpanded ? (
                            <button
                              type="button"
                              className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                              onClick={() => toggleExpanded(item.id)}
                            >
                              More...
                            </button>
                          ) : null}
                        </CardTitle>
                        <CardDescription>
                          {feedbackTypeLabels[item.type]} · {item.author_name}
                        </CardDescription>
                        <CardAction>
                          <Button
                            type="button"
                            variant={item.has_voted ? "default" : "outline"}
                            size="sm"
                            className="w-14 justify-center"
                            onClick={() => handleVote(item)}
                            disabled={votingId === item.id}
                            aria-label={
                              item.has_voted
                                ? "Remove feedback vote"
                                : "Upvote feedback"
                            }
                          >
                            {votingId === item.id ? (
                              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ThumbsUpIcon className="h-3.5 w-3.5" />
                            )}
                            {item.vote_count}
                          </Button>
                        </CardAction>
                      </CardHeader>
                    </Card>
                  )
                })}
              </CardGroup>
            )}
          </CardContent>
        </Card>

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </AdminModalContent>
    </Dialog>
  )
}
