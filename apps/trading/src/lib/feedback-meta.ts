import type * as React from "react"

import type { Badge } from "@/components/ui/badge"
import type { FeedbackType } from "@/lib/api/feedback"

/** Labels, badge styling, and date format shared by the feedback UIs. */

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

export const feedbackDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})
