import * as React from "react"
import { AlertCircleIcon, Loader2Icon, SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { AdminModalContent } from "@/pages/shared/admin-modal"
import {
  createFeedback,
  getFeedbackErrorMessage,
  type FeedbackItem,
  type FeedbackType,
} from "@/lib/feedback-api"

const feedbackTypes: Array<{ type: FeedbackType; label: string }> = [
  { type: "suggestion", label: "Suggestion" },
  { type: "bug_report", label: "Bug Report" },
  { type: "question", label: "Question" },
  { type: "praise", label: "Praise" },
]

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

  React.useEffect(() => {
    if (open) {
      setError(null)
    }
  }, [open])

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
      setMessage("")
      setFeedbackType("suggestion")
      onCreated?.(created)
      onOpenChange(false)
    } catch (submitError) {
      setError(getFeedbackErrorMessage(submitError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AdminModalContent
        title="Send Feedback"
        description="Share a request, report, question, or win."
        bodyClassName="space-y-5"
        footer={
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
            {isSubmitting ? "Sending" : "Send"}
          </Button>
        }
      >
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

        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="What's on your mind?"
          className="min-h-40 resize-none text-base"
          disabled={isSubmitting}
          autoFocus
        />

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
