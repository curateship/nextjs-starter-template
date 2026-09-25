/**
 * What the admin is told after approving or rejecting a submission.
 *
 * The decision and the email to the sender are two separate things, and the
 * email is the one that can fail on its own. So the message always states the
 * decision first, in the same words either way, and only then says whether the
 * sender heard about it. An admin who skims the first three words still reads
 * the part that is never in doubt.
 *
 * The wording lives here rather than inside the queue screen so both halves can
 * be read side by side and checked by a test.
 */
export function submissionDecisionMessage(
  decision: "approve" | "reject",
  emailed: boolean
): string {
  return decisionMessage("The listing is live", decision, emailed)
}

/**
 * The same wording for a suggested event. Approving the public's makes a
 * draft, and approving a listing owner's publishes it.
 */
export function eventSubmissionDecisionMessage(
  decision: "approve" | "reject",
  emailed: boolean,
  fromOwner = false
): string {
  return decisionMessage(
    fromOwner ? "The event is live" : "The event is saved as a draft",
    decision,
    emailed
  )
}

/**
 * The same wording for an owner's deal or change. Approving a deal publishes
 * it, and approving a change puts the new wording live.
 */
export function dealRequestDecisionMessage(
  decision: "approve" | "reject",
  emailed: boolean,
  kind: "new" | "change"
): string {
  return decisionMessage(
    kind === "new" ? "The deal is live" : "The change is live",
    decision,
    emailed
  )
}

function decisionMessage(
  made: string,
  decision: "approve" | "reject",
  emailed: boolean
): string {
  if (decision === "approve") {
    return emailed
      ? `Approved. ${made} and the sender has been emailed.`
      : `Approved. ${made}, but the email to the sender could not be sent.`
  }

  return emailed
    ? "Rejected. The sender has been emailed."
    : "Rejected, but the email to the sender could not be sent."
}
