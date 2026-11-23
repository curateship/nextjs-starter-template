export const CANCELLATION_REASONS = [
  "too_expensive",
  "missing_features",
  "hard_to_use",
  "not_using_enough",
  "temporary",
  "other",
] as const

export type CancellationReason = (typeof CANCELLATION_REASONS)[number]

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  too_expensive: "It costs too much",
  missing_features: "It is missing something I need",
  hard_to_use: "It is too hard to use",
  not_using_enough: "I am not using it enough",
  temporary: "I only need to leave for now",
  other: "Something else",
}

export const CANCELLATION_FEEDBACK_MAX_LENGTH = 500

export function cancellationReasonLabel(reason: string | null) {
  return reason && CANCELLATION_REASONS.includes(reason as CancellationReason)
    ? CANCELLATION_REASON_LABELS[reason as CancellationReason]
    : "Not provided"
}
