export type EmailDeliveryFailureKind = "needs_attention" | "retryable"

export type EmailDeliveryFailure = {
  kind: EmailDeliveryFailureKind
  reason: string
}

export const EMAIL_DELIVERY_NEEDS_ATTENTION = "EMAIL_DELIVERY_NEEDS_ATTENTION"
export const EMAIL_DELIVERY_RETRYABLE = "EMAIL_DELIVERY_RETRYABLE"

// Resend documents these as requests that cannot work until the key, sender,
// account, or request is corrected. Anything new stays retryable: guessing
// that an unfamiliar provider error is permanent would silently strand mail.
const NEEDS_ATTENTION_NAMES = new Set([
  "invalid_attachment",
  "invalid_access",
  "invalid_api_key",
  "invalid_from_address",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "invalid_parameter",
  "invalid_region",
  "missing_api_key",
  "missing_required_field",
  "monthly_quota_exceeded",
  "daily_quota_exceeded",
  "not_found",
  "method_not_allowed",
  "restricted_api_key",
  "security_error",
  "validation_error",
])

/** Turns Resend's changing response shape into one stable failure contract. */
export function describeResendFailure(
  status: number,
  body: unknown
): EmailDeliveryFailure {
  const record = asRecord(body)
  const nested = asRecord(record?.error)
  const name =
    stringValue(record?.name) ??
    stringValue(record?.type) ??
    stringValue(nested?.name) ??
    stringValue(nested?.type)
  const message =
    stringValue(record?.message) ?? stringValue(nested?.message) ?? ""
  const reason = cleanReason(message) || `Resend returned status ${status}.`

  return {
    kind:
      name && NEEDS_ATTENTION_NAMES.has(name) ? "needs_attention" : "retryable",
    reason,
  }
}

/** A network failure has no Resend response, but it is safe to try again. */
export function unreachableEmailServiceFailure(): EmailDeliveryFailure {
  return {
    kind: "retryable",
    reason: "The email service could not be reached.",
  }
}

/**
 * Carries the category through every caller. The provider's words cross the
 * server boundary only for an authenticated admin action.
 */
export function emailDeliveryError(
  failure: EmailDeliveryFailure,
  showReasonToAdmin = false
) {
  const code =
    failure.kind === "needs_attention"
      ? EMAIL_DELIVERY_NEEDS_ATTENTION
      : EMAIL_DELIVERY_RETRYABLE
  return new Error(showReasonToAdmin ? `${code}: ${failure.reason}` : code)
}

/** Specific admin wording for an email action, or null for another failure. */
export function describeAdminEmailDeliveryError(
  error: unknown,
  failedAction: string
) {
  const message = errorMessage(error)
  const needsAttention = reasonAfter(message, EMAIL_DELIVERY_NEEDS_ATTENTION)
  if (needsAttention !== null) {
    return `${failedAction} Resend needs attention: ${needsAttention}`
  }

  const retryable = reasonAfter(message, EMAIL_DELIVERY_RETRYABLE)
  if (retryable !== null) {
    return `${failedAction} Resend had a temporary problem: ${retryable} Try again shortly.`
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null
}

function cleanReason(reason: string) {
  return reason.replace(/\s+/g, " ").trim().slice(0, 500)
}

function errorMessage(error: unknown) {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : ""
}

function reasonAfter(message: string, code: string) {
  if (!message.includes(code)) return null
  const reason = cleanReason(message.slice(message.indexOf(code) + code.length))
    .replace(/^:\s*/, "")
    .trim()
  return reason || "No further reason was returned."
}
