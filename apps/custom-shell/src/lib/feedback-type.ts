import type * as React from "react"

import type { Badge } from "@/components/ui/badge"
import type { FeedbackType } from "@/lib/api/feedback"

/**
 * How a piece of feedback's kind is written and coloured. Three screens show
 * these badges — the feedback dashboard, its comments and an account's own
 * page — so the wording and colours live here once.
 *
 * The member feedback modal keeps its own copy on purpose: its badges are
 * clickable filters, so they cancel the hover colour these ones keep.
 */

export const feedbackTypeLabels: Record<FeedbackType, string> = {
  suggestion: "Suggestion",
  bug_report: "Bug Report",
  question: "Question",
  praise: "Praise",
}

export const feedbackTypeBadgeVariants: Record<
  FeedbackType,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  suggestion: "default",
  bug_report: "destructive",
  question: "outline",
  praise: "secondary",
}

export const feedbackTypeClassNames: Record<FeedbackType, string> = {
  suggestion: "",
  bug_report: "",
  question:
    "border-yellow-200 bg-yellow-100 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/50 dark:text-yellow-200",
  praise:
    "border-green-200 bg-green-100 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
}
